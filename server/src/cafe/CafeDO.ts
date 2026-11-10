import { DurableObject } from "cloudflare:workers";
import {
  applyCommand,
  type Actor,
  type Command,
  type CommandError,
  type Item,
  type ItemEvent,
  type ItemState,
} from "../domain/itemState";
import { actorFor, identityFromHeaders, recipientsFor, tagsFor, type ConnectionIdentity } from "./connection";
import { MAX_CATCH_UP_EVENTS, parseClientMessage, type ServerMessage, type WireEvent } from "./protocol";
import { SCHEMA } from "./schema";

export interface ItemCommandInput {
  venueId: string;
  /** Made by the tablet once per tap; a resend of the same tap reuses it. */
  idempotencyKey: string;
  itemId: string;
  command: Command;
  actor: Actor;
}

export type ItemCommandError =
  | CommandError
  | "ITEM_NOT_FOUND"
  | "IDEMPOTENCY_KEY_REUSED"
  /** Something unexpected failed; nothing was saved, so the tablet may retry with the same key. */
  | "INTERNAL_ERROR";

export type ItemCommandResult =
  /** `seq` is the new event's number, or null when nothing changed (`alreadyDone`). */
  | { ok: true; alreadyDone: boolean; item: Item; seq: number | null }
  | { ok: false; error: ItemCommandError };

/** A command's answer, plus the event to push (only when a new event was stored). */
interface Executed {
  result: ItemCommandResult;
  event: WireEvent | null;
}

/**
 * One instance per café. Holds the café's SQLite database and its tablets' WebSockets.
 *
 * Uses the WebSocket Hibernation API: the object may be evicted from memory between
 * messages while sockets stay open. So nothing about a connection is kept in a class
 * field; identity lives in the socket's attachment and routing in its tags.
 */
export class CafeDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const statement of SCHEMA) ctx.storage.sql.exec(statement);
    // Answered by the runtime without waking this object or counting as a request.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
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

    switch (message.type) {
      case "item.command": {
        const actor = actorFor(identity);
        if (actor === null) return send(ws, { type: "error", error: "NOT_ALLOWED_FOR_CONNECTION" });
        const { result, event } = this.#execute({
          venueId: identity.venueId,
          idempotencyKey: message.idempotencyKey,
          itemId: message.itemId,
          command: message.command,
          actor, // from the connection, never from the message
        });
        // The transaction has committed by now, so the push never shows a state
        // that could still be rolled back.
        send(ws, { type: "ack", idempotencyKey: message.idempotencyKey, result });
        if (event !== null) this.#push(event);
        return;
      }
      case "sync":
        return send(ws, this.#catchUp(identity, message.since));
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code, "closing");
    } catch {
      // Already closed (newer runtimes reply to the close automatically).
    }
  }

  #push(event: WireEvent): void {
    const message = JSON.stringify({ type: "event", event } satisfies ServerMessage);
    for (const tag of recipientsFor(event)) {
      for (const ws of this.ctx.getWebSockets(tag)) {
        try {
          ws.send(message);
        } catch {
          // A socket that is closing; that tablet will catch up with "sync" when it reconnects.
        }
      }
    }
  }

  /** Events after `since` that this connection would have been pushed. */
  #catchUp(identity: ConnectionIdentity, since: number): ServerMessage {
    // Waiters receive no item pushes until slice 3, so they have nothing to catch up on.
    if (identity.role === "staff") return { type: "sync.result", events: [], reloadRequired: false };

    const stationFilter = identity.role === "station" ? "AND i.station_id = ?" : "";
    const bindings: SqlStorageValue[] = identity.role === "station" ? [since, identity.stationId] : [since];
    const rows = this.ctx.storage.sql
      .exec<EventRow>(
        `SELECT e.seq, e.order_id, e.order_item_id, i.station_id, e.type, e.from_state, e.to_state,
                e.actor, e.at, e.details
           FROM order_events e JOIN order_items i ON i.id = e.order_item_id
          WHERE e.seq > ? ${stationFilter}
          ORDER BY e.seq
          LIMIT ${MAX_CATCH_UP_EVENTS + 1}`,
        ...bindings,
      )
      .toArray();

    if (rows.length > MAX_CATCH_UP_EVENTS) return { type: "sync.result", events: [], reloadRequired: true };
    return { type: "sync.result", events: rows.map(rowToWireEvent), reloadRequired: false };
  }

  // ---------- commands ----------

  /**
   * Apply one item command exactly once.
   *
   * Everything happens inside one synchronous transaction with no `await`, so no other
   * command can run in between (this is what makes "first command wins" true, D-07),
   * and if any write fails, every write of this command is rolled back.
   *
   * Never throws: an unexpected failure is logged and answered with INTERNAL_ERROR.
   * Because the transaction rolled back, no idempotency record exists, so a retry is safe.
   */
  handleItemCommand(input: ItemCommandInput): ItemCommandResult {
    return this.#execute(input).result;
  }

  #execute(input: ItemCommandInput): Executed {
    const now = Date.now(); // server time is authoritative (D-16)
    try {
      return this.ctx.storage.transactionSync(() => this.#handle(input, now));
    } catch (error) {
      console.error("handleItemCommand failed; transaction rolled back", {
        idempotencyKey: input.idempotencyKey,
        itemId: input.itemId,
        command: input.command.type,
        error: error instanceof Error ? error.message : String(error),
      });
      return { result: { ok: false, error: "INTERNAL_ERROR" }, event: null };
    }
  }

  #handle(input: ItemCommandInput, now: number): Executed {
    const sql = this.ctx.storage.sql;
    const fingerprint = canonicalJson({ itemId: input.itemId, command: input.command, actor: input.actor });

    const prior = sql
      .exec<{ fingerprint: string; result: string }>(
        "SELECT fingerprint, result FROM processed_commands WHERE idempotency_key = ?",
        input.idempotencyKey,
      )
      .toArray()[0];
    if (prior !== undefined) {
      // A replay never produces an event, so it is never pushed twice.
      if (prior.fingerprint !== fingerprint) {
        return { result: { ok: false, error: "IDEMPOTENCY_KEY_REUSED" }, event: null };
      }
      return { result: JSON.parse(prior.result) as ItemCommandResult, event: null };
    }

    const row = sql
      .exec<ItemRow>("SELECT * FROM order_items WHERE id = ? AND venue_id = ?", input.itemId, input.venueId)
      .toArray()[0];
    // Not saved under the idempotency key: the item may simply not have arrived yet,
    // so a later resend should be checked again rather than get a stale answer.
    if (row === undefined) return { result: { ok: false, error: "ITEM_NOT_FOUND" }, event: null };

    const item = rowToItem(row);
    const executed = this.#apply(row, item, input, now);

    sql.exec(
      "INSERT INTO processed_commands (idempotency_key, venue_id, fingerprint, result, at) VALUES (?, ?, ?, ?, ?)",
      input.idempotencyKey,
      input.venueId,
      fingerprint,
      JSON.stringify(executed.result),
      now,
    );
    return executed;
  }

  #apply(row: ItemRow, item: Item, input: ItemCommandInput, now: number): Executed {
    const outcome = applyCommand(item, input.command, input.actor, now);
    if (!outcome.ok) {
      // A double tap or resend: report success without changing anything (D-35).
      if (outcome.error === "ALREADY_IN_STATE") {
        return { result: { ok: true, alreadyDone: true, item, seq: null }, event: null };
      }
      return { result: outcome, event: null };
    }

    const sql = this.ctx.storage.sql;
    const next = outcome.item;
    sql.exec(
      `UPDATE order_items
          SET state = ?, last_tap_station_id = ?, last_tap_action = ?, last_tap_at = ?, last_tap_previous_state = ?
        WHERE id = ?`,
      next.state,
      next.lastTap?.stationId ?? null,
      next.lastTap?.action ?? null,
      next.lastTap?.at ?? null,
      next.lastTap?.previousState ?? null,
      next.id,
    );
    const seq = insertEvent(sql, row, outcome.event);
    const { type, itemId, from, to, actor, at, details } = outcome.event;
    const event: WireEvent = { seq, orderId: row.order_id, itemId, stationId: row.station_id, type, from, to, actor, at };
    if (details !== undefined) event.details = details;
    return { result: { ok: true, alreadyDone: false, item: next, seq }, event };
  }
}

// ---------- helpers ----------

type ItemRow = {
  id: string;
  venue_id: string;
  order_id: string;
  station_id: string;
  state: string;
  last_tap_station_id: string | null;
  last_tap_action: string | null;
  last_tap_at: number | null;
  last_tap_previous_state: string | null;
};

function rowToItem(row: ItemRow): Item {
  const hasTap =
    row.last_tap_station_id !== null &&
    row.last_tap_action !== null &&
    row.last_tap_at !== null &&
    row.last_tap_previous_state !== null;
  return {
    id: row.id,
    stationId: row.station_id,
    // The table's CHECK constraints guarantee these strings are valid states and actions.
    state: row.state as ItemState,
    lastTap: hasTap
      ? {
          stationId: row.last_tap_station_id as string,
          action: row.last_tap_action as "accept" | "ready",
          at: row.last_tap_at as number,
          previousState: row.last_tap_previous_state as ItemState,
        }
      : null,
  };
}

function insertEvent(sql: SqlStorage, row: ItemRow, event: ItemEvent): number {
  const inserted = sql
    .exec<{ seq: number }>(
      `INSERT INTO order_events (venue_id, order_id, order_item_id, type, from_state, to_state, actor, at, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING seq`,
      row.venue_id,
      row.order_id,
      event.itemId,
      event.type,
      event.from,
      event.to,
      JSON.stringify(event.actor),
      event.at,
      event.details === undefined ? null : JSON.stringify(event.details),
    )
    .one();
  return inserted.seq;
}

type EventRow = {
  seq: number;
  order_id: string;
  order_item_id: string;
  station_id: string;
  type: string;
  from_state: string;
  to_state: string;
  actor: string;
  at: number;
  details: string | null;
};

function rowToWireEvent(row: EventRow): WireEvent {
  // Rows are only ever written by insertEvent from validated events, so these casts hold.
  const event: WireEvent = {
    seq: row.seq,
    orderId: row.order_id,
    itemId: row.order_item_id,
    stationId: row.station_id,
    type: row.type as WireEvent["type"],
    from: row.from_state as ItemState,
    to: row.to_state as ItemState,
    actor: JSON.parse(row.actor) as Actor,
    at: row.at,
  };
  if (row.details !== null) event.details = JSON.parse(row.details) as Record<string, unknown>;
  return event;
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
