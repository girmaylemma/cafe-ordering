import { DurableObject } from "cloudflare:workers";
import { isValidVenueId, makeDeviceToken, pinHash, randomSecret, sha256Hex } from "../auth/crypto";
import type { Actor } from "../domain/itemState";
import {
  approveVoid,
  completeSignIn,
  findLiveSession,
  findPairedDevice,
  isValidPin,
  type SignInResult,
  type StaffRole,
} from "./auth";
import { actorFor, liveIdentityFromHeaders, recipientsFor, tagsFor, type ConnectionIdentity } from "./connection";
import { EVENT_COLUMNS, rowToWireEvent, type EventRow, type Handled } from "./events";
import { handleItemCommand, type ItemCommandInput, type ItemCommandResult } from "./items";
import { closeSession, openSession, sendOrder } from "./orders";
import {
  isId,
  MAX_CATCH_UP_EVENTS,
  parseClientMessage,
  type ClientMessage,
  type ManagerApproval,
  type ServerMessage,
  type WireEvent,
} from "./protocol";
import { SCHEMA } from "./schema";

export type { ItemCommandInput, ItemCommandResult } from "./items";
export type { SignInResult } from "./auth";

type Handler = (sql: SqlStorage, now: number) => Handled;

/** A command message, ready to run: its idempotency key, what makes it unique, and the handler. */
interface Runnable {
  key: string;
  fingerprintSource: unknown;
  handler: Handler;
}

/**
 * Stored on each socket (it survives hibernation). The hashes let every message re-check that the
 * device is still paired and the PIN session still live, so revoke and sign-out take effect at once.
 */
interface SocketAuth {
  identity: ConnectionIdentity;
  deviceTokenHash: string | null; // null only for the internal live view
  sessionHash: string | null; // set for waiters
}

/** WebSocket close code for "credentials no longer valid" (4000–4999 are for applications). */
const CLOSE_AUTH_ENDED = 4001;

type Fail<E extends string> = { ok: false; error: E };

/**
 * One instance per café. Holds the café's SQLite database and its tablets' WebSockets.
 *
 * Uses the WebSocket Hibernation API: the object may be evicted from memory between
 * messages while sockets stay open. So nothing about a connection is kept in a class
 * field; identity lives in the socket's attachment and routing in its tags.
 *
 * This class does transport, authentication, idempotency and pushing. The rules live in
 * items.ts (item commands), orders.ts (sessions and rounds) and auth.ts (PINs and sessions).
 */
export class CafeDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const statement of SCHEMA) ctx.storage.sql.exec(statement);
    // Answered by the runtime without waking this object or counting as a request.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // ---------- RPC: item commands (internal callers and tests) ----------

  handleItemCommand(input: ItemCommandInput): ItemCommandResult {
    // Trusted internal callers only: here `approvedBy` is taken as given (tablets can't reach this).
    const handled = this.#run(
      input.venueId,
      input.idempotencyKey,
      itemFingerprint(input.itemId, input.command, input.actor, null),
      (sql, now) => handleItemCommand(sql, input, now),
    );
    // Item handlers and #run only ever produce item results or the shared errors.
    return handled.result as ItemCommandResult;
  }

  // ---------- RPC: setup (the dashboard will call these; internal only for now) ----------

  async createStaff(input: {
    venueId: string;
    id: string;
    name: string;
    role: StaffRole;
    pin: string;
  }): Promise<{ ok: true } | Fail<"INVALID_INPUT" | "INVALID_PIN" | "STAFF_EXISTS">> {
    const { venueId, id, name, role, pin } = input;
    if (!isValidVenueId(venueId) || !isId(id) || !isName(name) || !["waiter", "manager", "owner"].includes(role)) {
      return { ok: false, error: "INVALID_INPUT" };
    }
    if (!isValidPin(role, pin)) return { ok: false, error: "INVALID_PIN" };

    const salt = randomSecret(16);
    const hash = await pinHash(this.env.SERVER_SECRET, salt, pin);
    // From here on synchronous: nothing can run between the check and the insert.
    const sql = this.ctx.storage.sql;
    if (sql.exec("SELECT 1 FROM staff WHERE id = ?", id).toArray().length > 0) return { ok: false, error: "STAFF_EXISTS" };
    sql.exec(
      "INSERT INTO staff (id, venue_id, name, role, pin_salt, pin_hash) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      venueId,
      name,
      role,
      salt,
      hash,
    );
    return { ok: true };
  }

  /** A-04: deactivate at once. Ends all their PIN sessions and closes their sockets. */
  deactivateStaff(userId: string): { ok: true } | Fail<"STAFF_NOT_FOUND"> {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    const changed = sql.exec("UPDATE staff SET active = 0 WHERE id = ?", userId).rowsWritten;
    if (changed === 0) return { ok: false, error: "STAFF_NOT_FOUND" };
    sql.exec("UPDATE staff_sessions SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL", now, userId);
    this.#closeSockets(`waiter:${userId}`);
    return { ok: true };
  }

  createDevice(input: {
    venueId: string;
    id: string;
    name: string;
    kind: "waiter" | "station";
    stationId: string | null;
  }): { ok: true } | Fail<"INVALID_INPUT" | "DEVICE_EXISTS"> {
    const { venueId, id, name, kind, stationId } = input;
    const stationOk = kind === "station" ? isId(stationId) : kind === "waiter" && stationId === null;
    if (!isValidVenueId(venueId) || !isId(id) || !isName(name) || !stationOk) return { ok: false, error: "INVALID_INPUT" };
    const sql = this.ctx.storage.sql;
    if (sql.exec("SELECT 1 FROM devices WHERE id = ?", id).toArray().length > 0) return { ok: false, error: "DEVICE_EXISTS" };
    sql.exec("INSERT INTO devices (id, venue_id, name, kind, station_id) VALUES (?, ?, ?, ?, ?)", id, venueId, name, kind, stationId);
    return { ok: true };
  }

  /** A one-time 6-digit code the tablet enters to pair (D-14). */
  async createPairingCode(
    deviceId: string,
  ): Promise<{ ok: true; code: string; expiresAt: number } | Fail<"DEVICE_NOT_FOUND" | "ALREADY_PAIRED" | "DEVICE_REVOKED">> {
    const device = this.#unpairedDevice(deviceId);
    if (!device.ok) return device;
    const directory = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName("directory"));
    return { ok: true, ...(await directory.createPairingCode(device.venueId, deviceId)) };
  }

  /** Called after the Directory accepted a pairing code: issue the device token. */
  async completePairing(deviceId: string): Promise<
    | { ok: true; token: string; device: { id: string; name: string; kind: "waiter" | "station"; stationId: string | null } }
    | Fail<"DEVICE_NOT_FOUND" | "ALREADY_PAIRED" | "DEVICE_REVOKED">
  > {
    const before = this.#unpairedDevice(deviceId);
    if (!before.ok) return before;
    const token = await makeDeviceToken(this.env.SERVER_SECRET, before.venueId);
    const tokenHash = await sha256Hex(token);

    // Check again after the awaits: another call may have paired or revoked it meanwhile.
    const device = this.#unpairedDevice(deviceId);
    if (!device.ok) return device;
    this.ctx.storage.sql.exec("UPDATE devices SET token_hash = ?, paired_at = ? WHERE id = ?", tokenHash, Date.now(), deviceId);
    const row = this.ctx.storage.sql
      .exec<{ name: string; kind: "waiter" | "station"; station_id: string | null }>(
        "SELECT name, kind, station_id FROM devices WHERE id = ?",
        deviceId,
      )
      .one();
    return { ok: true, token, device: { id: deviceId, name: row.name, kind: row.kind, stationId: row.station_id } };
  }

  /** D-13: the token stops working at once; open sockets are closed and PIN sessions ended. */
  revokeDevice(deviceId: string): { ok: true } | Fail<"DEVICE_NOT_FOUND"> {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    const changed = sql
      .exec("UPDATE devices SET revoked_at = ?, token_hash = NULL WHERE id = ? AND revoked_at IS NULL", now, deviceId)
      .rowsWritten;
    if (changed === 0 && sql.exec("SELECT 1 FROM devices WHERE id = ?", deviceId).toArray().length === 0) {
      return { ok: false, error: "DEVICE_NOT_FOUND" };
    }
    sql.exec("UPDATE staff_sessions SET ended_at = ? WHERE device_id = ? AND ended_at IS NULL", now, deviceId);
    this.#closeSockets(`device:${deviceId}`);
    return { ok: true };
  }

  // ---------- RPC: called by the public Worker ----------

  /** The sign-in screen's list of names (active staff only, no PIN data). */
  async listStaff(
    deviceToken: string,
  ): Promise<{ ok: true; staff: Array<{ id: string; name: string; role: StaffRole }> } | Fail<"UNAUTHORIZED_DEVICE">> {
    const device = findPairedDevice(this.ctx.storage.sql, await sha256Hex(deviceToken));
    if (device === null) return { ok: false, error: "UNAUTHORIZED_DEVICE" };
    const staff = this.ctx.storage.sql
      .exec<{ id: string; name: string; role: StaffRole }>(
        "SELECT id, name, role FROM staff WHERE venue_id = ? AND active = 1 ORDER BY name",
        device.venue_id,
      )
      .toArray();
    return { ok: true, staff };
  }

  /**
   * PIN sign-in (D-10, D-11). All hashing happens first; then one synchronous step checks the
   * lockout, compares, and updates the counters, so parallel guesses are all counted.
   */
  async signIn(input: { deviceToken: string; userId: string; pin: string }): Promise<SignInResult> {
    const sql = this.ctx.storage.sql;
    const deviceTokenHash = await sha256Hex(input.deviceToken);
    const deviceBefore = findPairedDevice(sql, deviceTokenHash);
    if (deviceBefore === null) return { ok: false, error: "UNAUTHORIZED_DEVICE" };
    if (deviceBefore.kind !== "waiter") return { ok: false, error: "NOT_A_WAITER_DEVICE" };

    const salt = sql
      .exec<{ pin_salt: string }>("SELECT pin_salt FROM staff WHERE id = ? AND venue_id = ?", input.userId, deviceBefore.venue_id)
      .toArray()[0]?.pin_salt;
    const computedHash = salt === undefined ? null : await pinHash(this.env.SERVER_SECRET, salt, input.pin);
    const sessionToken = randomSecret();
    const sessionHash = await sha256Hex(sessionToken);

    return this.ctx.storage.transactionSync((): SignInResult => {
      const device = findPairedDevice(sql, deviceTokenHash); // may have been revoked during the awaits
      if (device === null) return { ok: false, error: "UNAUTHORIZED_DEVICE" };
      return completeSignIn(sql, { device, userId: input.userId, computedHash, sessionToken, sessionHash, now: Date.now() });
    });
  }

  async signOut(input: { deviceToken: string; sessionToken: string }): Promise<{ ok: true } | Fail<"UNAUTHORIZED_DEVICE">> {
    const deviceTokenHash = await sha256Hex(input.deviceToken);
    const sessionHash = await sha256Hex(input.sessionToken);
    const device = findPairedDevice(this.ctx.storage.sql, deviceTokenHash);
    if (device === null) return { ok: false, error: "UNAUTHORIZED_DEVICE" };
    this.ctx.storage.sql.exec(
      "UPDATE staff_sessions SET ended_at = ? WHERE token_hash = ? AND device_id = ? AND ended_at IS NULL",
      Date.now(),
      sessionHash,
      device.id,
    );
    this.#closeSockets(`device:${device.id}`);
    return { ok: true };
  }

  // ---------- WebSocket transport ----------

  /** WebSocket upgrade. Tablets authenticate with a device token (+ PIN session for waiters). */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const auth = await this.#authenticate(request.headers);
    if (auth === null) return new Response("Unauthorized", { status: 401 });

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, tagsFor(auth.identity));
    server.serializeAttachment(auth);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const auth = ws.deserializeAttachment() as SocketAuth;
    // Revoke, deactivate, sign-out and expiry take effect on the very next message.
    if (!this.#stillAuthorized(auth)) {
      send(ws, { type: "error", error: "SESSION_ENDED" });
      ws.close(CLOSE_AUTH_ENDED, "session ended");
      return;
    }
    const identity = auth.identity;
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return send(ws, { type: "error", error: parsed.error });
    const message = parsed.message;

    if (message.type === "sync") return send(ws, this.#catchUp(identity, message.since));

    // A typed manager PIN is hashed BEFORE the transaction (hashing is async, D-55);
    // the lockout check and comparison then happen inside it, together with the void.
    let typed: TypedApproval | null = null;
    if (message.type === "item.command" && message.approval !== null) {
      typed = { managerId: message.approval.managerId, computedHash: await this.#hashStaffPin(identity.venueId, message.approval) };
      // The await let other messages run: make sure this socket is still allowed.
      if (!this.#stillAuthorized(auth)) {
        send(ws, { type: "error", error: "SESSION_ENDED" });
        ws.close(CLOSE_AUTH_ENDED, "session ended");
        return;
      }
    }

    // The actor always comes from the connection, never from the message.
    const actor = actorFor(identity);
    const deviceId = identity.role === "live" ? null : identity.deviceId;
    const runnable = actor === null ? null : toRunnable(message, identity.venueId, actor, typed, deviceId);
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

  // ---------- authentication ----------

  async #authenticate(headers: Headers): Promise<SocketAuth | null> {
    const token = bearerToken(headers.get("Authorization"));
    if (token === null) {
      // Only the internal live view connects without a token (the Worker strips X-Cafe-* headers).
      const live = liveIdentityFromHeaders(headers);
      return live === null ? null : { identity: live, deviceTokenHash: null, sessionHash: null };
    }

    const deviceTokenHash = await sha256Hex(token);
    const sessionToken = headers.get("X-Staff-Session");
    const sessionHash = sessionToken === null ? null : await sha256Hex(sessionToken);

    // After the awaits, everything below is synchronous.
    const sql = this.ctx.storage.sql;
    const device = findPairedDevice(sql, deviceTokenHash);
    if (device === null) return null;
    if (device.kind === "station") {
      return {
        identity: { role: "station", venueId: device.venue_id, deviceId: device.id, stationId: device.station_id! },
        deviceTokenHash,
        sessionHash: null,
      };
    }
    if (sessionHash === null) return null; // a waiter tablet needs a PIN session
    const session = findLiveSession(sql, sessionHash, device.id, Date.now());
    if (session === null) return null;
    return {
      identity: { role: "staff", venueId: device.venue_id, deviceId: device.id, userId: session.userId },
      deviceTokenHash,
      sessionHash,
    };
  }

  /** The keyed hash of a typed PIN, or null if that staff member doesn't exist here. */
  async #hashStaffPin(venueId: string, approval: ManagerApproval): Promise<string | null> {
    const salt = this.ctx.storage.sql
      .exec<{ pin_salt: string }>("SELECT pin_salt FROM staff WHERE id = ? AND venue_id = ?", approval.managerId, venueId)
      .toArray()[0]?.pin_salt;
    return salt === undefined ? null : pinHash(this.env.SERVER_SECRET, salt, approval.managerPin);
  }

  #stillAuthorized(auth: SocketAuth): boolean {
    if (auth.deviceTokenHash === null) return true; // internal live view
    const sql = this.ctx.storage.sql;
    const device = findPairedDevice(sql, auth.deviceTokenHash);
    if (device === null) return false;
    if (auth.sessionHash === null) return device.kind === "station";
    return findLiveSession(sql, auth.sessionHash, device.id, Date.now()) !== null;
  }

  #unpairedDevice(deviceId: string): { ok: true; venueId: string } | Fail<"DEVICE_NOT_FOUND" | "ALREADY_PAIRED" | "DEVICE_REVOKED"> {
    const row = this.ctx.storage.sql
      .exec<{ venue_id: string; token_hash: string | null; revoked_at: number | null }>(
        "SELECT venue_id, token_hash, revoked_at FROM devices WHERE id = ?",
        deviceId,
      )
      .toArray()[0];
    if (row === undefined) return { ok: false, error: "DEVICE_NOT_FOUND" };
    if (row.revoked_at !== null) return { ok: false, error: "DEVICE_REVOKED" };
    if (row.token_hash !== null) return { ok: false, error: "ALREADY_PAIRED" };
    return { ok: true, venueId: row.venue_id };
  }

  #closeSockets(tag: string): void {
    for (const ws of this.ctx.getWebSockets(tag)) {
      try {
        ws.close(CLOSE_AUTH_ENDED, "access revoked");
      } catch {
        // Already closing.
      }
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

/** A typed manager PIN after hashing; the PIN itself goes no further. */
interface TypedApproval {
  managerId: string;
  computedHash: string | null;
}

/** Map a command message to its handler, or null if this actor may not send it. */
function toRunnable(
  message: Exclude<ClientMessage, { type: "sync" }>,
  venueId: string,
  actor: Actor,
  typed: TypedApproval | null,
  deviceId: string | null,
): Runnable | null {
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
      // The approver's id is part of the command's identity; the PIN never is (it would be stored).
      fingerprintSource: itemFingerprint(message.itemId, message.command, actor, typed?.managerId ?? null),
      handler: (sql, now) => {
        // A station's void is refused by the state machine (WRONG_ACTOR); only staff voids need approval.
        if (input.command.type !== "void" || actor.kind !== "staff") return handleItemCommand(sql, input, now);
        const approval = approveVoid(sql, { venueId, actorUserId: actor.userId, typed, deviceId, now });
        // Not stored under the key, so the same tap can be retried with the right PIN.
        if (!approval.ok) return { result: approval, events: [], store: false };
        return handleItemCommand(sql, { ...input, command: { ...input.command, approvedBy: approval.approvedBy } }, now);
      },
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

/** The same shape for RPC and WebSocket, so the same command matches either way. */
function itemFingerprint(itemId: string, command: unknown, actor: Actor, approverId: string | null) {
  return { itemId, command, actor, approverId };
}

function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer ([A-Za-z0-9._-]{1,300})$/);
  return match?.[1] ?? null;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 60;
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
