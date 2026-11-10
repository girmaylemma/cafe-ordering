import { DurableObject } from "cloudflare:workers";
import type { Actor } from "../domain/itemState";
import { actorFor, identityFromHeaders, recipientsFor, tagsFor, type ConnectionIdentity } from "./connection";
import { EVENT_COLUMNS, rowToWireEvent, type EventRow, type Handled } from "./events";
import { handleItemCommand, type ItemCommandInput, type ItemCommandResult } from "./items";
import { closeSession, openSession, sendOrder } from "./orders";
import {
  MAX_CATCH_UP_EVENTS,
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
  type WireEvent,
} from "./protocol";
import { SCHEMA } from "./schema";

export type { ItemCommandInput, ItemCommandResult } from "./items";

type Handler = (sql: SqlStorage, now: number) => Handled;

/** A command message, ready to run: its idempotency key, what makes it unique, and the handler. */
interface Runnable {
  key: string;
  fingerprintSource: unknown;
  handler: Handler;
}

/**
 * One instance per café. Holds the café's SQLite database and its tablets' WebSockets.
 *
 * Uses the WebSocket Hibernation API: the object may be evicted from memory between
 * messages while sockets stay open. So nothing about a connection is kept in a class
 * field; identity lives in the socket's attachment and routing in its tags.
 *
 * This class only does transport, idempotency and pushing. The rules live in
 * items.ts (item commands) and orders.ts (sessions and rounds).
 */
export class CafeDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const statement of SCHEMA) ctx.storage.sql.exec(statement);
    // Answered by the runtime without waking this object or counting as a request.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // ---------- RPC (internal callers and tests) ----------

  handleItemCommand(input: ItemCommandInput): ItemCommandResult {
    const handled = this.#run(
      input.venueId,
      input.idempotencyKey,
      itemFingerprint(input.itemId, input.command, input.actor),
      (sql, now) => handleItemCommand(sql, input, now),
    );
    // Item handlers and #run only ever produce item results or the shared errors.
    return handled.result as ItemCommandResult;
  }

  // ---------- WebSocket transport ----------

  /** WebSocket upgrade. Only reachable from internal code that sets the identity headers. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const identity = identityFromHeaders(request.headers);
    if (identity === null) return new Response("Missing or invalid identity", { status: 400 });

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, tagsFor(identity));
    server.serializeAttachment(identity);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const identity = ws.deserializeAttachment() as ConnectionIdentity;
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return send(ws, { type: "error", error: parsed.error });
    const message = parsed.message;

    if (message.type === "sync") return send(ws, this.#catchUp(identity, message.since));

    // The actor always comes from the connection, never from the message.
    const actor = actorFor(identity);
    const runnable = actor === null ? null : toRunnable(message, identity.venueId, actor);
    if (runnable === null) return send(ws, { type: "error", error: "NOT_ALLOWED_FOR_CONNECTION" });

    const handled = this.#run(identity.venueId, runnable.key, runnable.fingerprintSource, runnable.handler);
    // The transaction has committed by now, so a push never shows a state that could
    // still be rolled back.
    send(ws, { type: "ack", idempotencyKey: runnable.key, result: handled.result });
    this.#push(handled.events);
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code, "closing");
    } catch {
      // Already closed (newer runtimes reply to the close automatically).
    }
  }

  // ---------- idempotent execution ----------

  /**
   * Run a command exactly once.
   *
   * Everything happens inside one synchronous transaction with no `await`, so no other
   * command can run in between (D-37), and if any write fails, every write of this command
   * is rolled back. Never throws: an unexpected failure is logged and answered with
   * INTERNAL_ERROR, which is not saved, so a retry with the same key is safe (D-38).
   */
  #run(venueId: string, key: string, fingerprintSource: unknown, handler: Handler): Handled {
    const now = Date.now(); // server time is authoritative (D-16)
    const sql = this.ctx.storage.sql;
    try {
      return this.ctx.storage.transactionSync((): Handled => {
        const fingerprint = canonicalJson(fingerprintSource);
        const prior = sql
          .exec<{ fingerprint: string; result: string }>(
            "SELECT fingerprint, result FROM processed_commands WHERE idempotency_key = ?",
            key,
          )
          .toArray()[0];
        if (prior !== undefined) {
          // A replay never produces events, so it is never pushed twice.
          if (prior.fingerprint !== fingerprint) {
            return { result: { ok: false, error: "IDEMPOTENCY_KEY_REUSED" }, events: [], store: false };
          }
          return { result: JSON.parse(prior.result) as Handled["result"], events: [], store: false };
        }

        const handled = handler(sql, now);
        if (handled.store) {
          sql.exec(
            "INSERT INTO processed_commands (idempotency_key, venue_id, fingerprint, result, at) VALUES (?, ?, ?, ?, ?)",
            key,
            venueId,
            fingerprint,
            JSON.stringify(handled.result),
            now,
          );
        }
        return handled;
      });
    } catch (error) {
      console.error("command failed; transaction rolled back", {
        idempotencyKey: key,
        error: error instanceof Error ? error.message : String(error),
      });
      return { result: { ok: false, error: "INTERNAL_ERROR" }, events: [], store: false };
    }
  }

  // ---------- pushing and catching up ----------

  #push(events: WireEvent[]): void {
    for (const event of events) {
      const message = JSON.stringify({ type: "event", event } satisfies ServerMessage);
      for (const tag of recipientsFor(event, this.#currentWaiterOf(event.itemId))) {
        for (const ws of this.ctx.getWebSockets(tag)) {
          try {
            ws.send(message);
          } catch {
            // A socket that is closing; that tablet will catch up with "sync" when it reconnects.
          }
        }
      }
    }
  }

  /** The waiter who currently holds the item's table, or null if the item has no session. */
  #currentWaiterOf(itemId: string): string | null {
    const row = this.ctx.storage.sql
      .exec<{ waiter_id: string }>(
        `SELECT s.waiter_id FROM order_items i
           JOIN orders o ON o.id = i.order_id
           JOIN table_sessions s ON s.id = o.session_id
          WHERE i.id = ?`,
        itemId,
      )
      .toArray()[0];
    return row?.waiter_id ?? null;
  }

  /** Item events after `since` that this connection would have been pushed (D-42). */
  #catchUp(identity: ConnectionIdentity, since: number): ServerMessage {
    let join = "";
    let filter = "";
    const bindings: SqlStorageValue[] = [since];
    switch (identity.role) {
      case "station":
        filter = "AND i.station_id = ?";
        bindings.push(identity.stationId);
        break;
      case "staff":
        // Only the tables this waiter holds right now.
        join = "JOIN orders o ON o.id = i.order_id JOIN table_sessions s ON s.id = o.session_id";
        filter = "AND s.status = 'open' AND s.waiter_id = ?";
        bindings.push(identity.userId);
        break;
      case "live":
        break;
    }
    const rows = this.ctx.storage.sql
      .exec<EventRow>(
        `SELECT ${EVENT_COLUMNS}
           FROM order_events e JOIN order_items i ON i.id = e.order_item_id ${join}
          WHERE e.seq > ? ${filter}
          ORDER BY e.seq
          LIMIT ${MAX_CATCH_UP_EVENTS + 1}`,
        ...bindings,
      )
      .toArray();

    if (rows.length > MAX_CATCH_UP_EVENTS) return { type: "sync.result", events: [], reloadRequired: true };
    return { type: "sync.result", events: rows.map(rowToWireEvent), reloadRequired: false };
  }
}

// ---------- helpers ----------

/** Map a command message to its handler, or null if this actor may not send it. */
function toRunnable(message: Exclude<ClientMessage, { type: "sync" }>, venueId: string, actor: Actor): Runnable | null {
  if (message.type === "item.command") {
    const input: ItemCommandInput = {
      venueId,
      idempotencyKey: message.idempotencyKey,
      itemId: message.itemId,
      command: message.command,
      actor,
    };
    return {
      key: message.idempotencyKey,
      fingerprintSource: itemFingerprint(message.itemId, message.command, actor),
      handler: (sql, now) => handleItemCommand(sql, input, now),
    };
  }

  // Sessions and rounds are waiter actions only.
  if (actor.kind !== "staff") return null;
  const waiterId = actor.userId;
  const fingerprintSource = { message, actor };
  switch (message.type) {
    case "session.open":
      return { key: message.idempotencyKey, fingerprintSource, handler: (sql, now) => openSession(sql, venueId, waiterId, message, now) };
    case "session.close":
      return { key: message.idempotencyKey, fingerprintSource, handler: (sql, now) => closeSession(sql, venueId, waiterId, message, now) };
    case "order.send":
      return { key: message.orderId, fingerprintSource, handler: (sql, now) => sendOrder(sql, venueId, waiterId, message, now) };
  }
}

/** Kept identical to slice 1, so item commands sent over RPC and WebSocket match. */
function itemFingerprint(itemId: string, command: unknown, actor: Actor) {
  return { itemId, command, actor };
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

/** JSON with object keys sorted, so the same command always gives the same string. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
