/**
 * Move, merge and hand over a table visit (W-09, 3c). All need a live connection (D-18).
 *
 * - Move: the whole visit goes to a FREE table.
 * - Merge: one visit's rounds go into another visit; the emptied table becomes free. The target
 *   keeps its waiter; the requester must hold both tables or be a manager.
 * - Hand over: takes effect at once; the receiver is told; later alerts follow the table (D-06).
 * Sales credit never moves: it stays with whoever placed each round (orders.waiter_id).
 */
import type { Actor } from "../domain/itemState";
import { isManagerHere } from "./auth";
import { insertEvent, type Handled, type Notice } from "./events";
import { findOpenSessionForTable, findSession, findTable, type SessionRow } from "./orders";
import type { WireEvent } from "./protocol";

type CommonError = "IDEMPOTENCY_KEY_REUSED" | "INTERNAL_ERROR";
export type SessionActionResult =
  | { ok: true; alreadyDone: boolean; sessionId: string; tableId: string }
  | {
      ok: false;
      error:
        | "SESSION_NOT_FOUND"
        | "SESSION_CLOSED"
        | "NOT_YOUR_TABLE"
        | "TABLE_NOT_FOUND"
        | "TABLE_ALREADY_OPEN"
        | "STAFF_NOT_FOUND"
        | "SAME_SESSION"
        | CommonError;
    };

type Fail = Extract<SessionActionResult, { ok: false }>["error"];
const refuse = (error: Fail, store = true): Handled => ({ result: { ok: false, error }, events: [], store });
const staff = (userId: string): Actor => ({ kind: "staff", userId });

/** An open session the actor may act on (they hold it, or they are a manager, D-78). */
function ownOpenSession(sql: SqlStorage, venueId: string, userId: string, sessionId: string): SessionRow | Handled {
  const session = findSession(sql, venueId, sessionId);
  if (session === null) return refuse("SESSION_NOT_FOUND", false); // may not have arrived yet (D-39)
  if (session.status !== "open") return refuse("SESSION_CLOSED");
  if (session.waiter_id !== userId && !isManagerHere(sql, venueId, userId)) return refuse("NOT_YOUR_TABLE", false);
  return session;
}
const isHandled = (v: SessionRow | Handled): v is Handled => "result" in v;

/**
 * Tell the kitchen (and catch-up) the new table of every unfinished item in these orders:
 * an `item.table_changed` event per item, so a reconnecting tablet replays it too (D-48, D-79).
 */
function announceTable(sql: SqlStorage, venueId: string, sessionId: string, orderIds: readonly string[], table: { id: string; name: string }, actor: Actor, now: number): WireEvent[] {
  const events: WireEvent[] = [];
  for (const orderId of orderIds) {
    const items = sql
      .exec<{ id: string; station_id: string; state: string }>(
        "SELECT id, station_id, state FROM order_items WHERE order_id = ? AND state IN ('sent', 'accepted', 'ready') ORDER BY rowid",
        orderId,
      )
      .toArray();
    for (const item of items) {
      const details = { tableId: table.id, tableName: table.name };
      const state = item.state as WireEvent["to"];
      const seq = insertEvent(sql, { venueId, sessionId, orderId, itemId: item.id, type: "item.table_changed", from: state, to: state, actor, at: now, details });
      events.push({ seq, orderId, itemId: item.id, stationId: item.station_id, type: "item.table_changed", from: state, to: state, actor, at: now, details });
    }
  }
  return events;
}

const ordersOf = (sql: SqlStorage, sessionId: string) =>
  sql.exec<{ id: string }>("SELECT id FROM orders WHERE session_id = ? ORDER BY round", sessionId).toArray().map((r) => r.id);

// ---------- move ----------

export function moveSession(sql: SqlStorage, venueId: string, userId: string, message: { sessionId: string; toTableId: string }, now: number): Handled {
  const session = ownOpenSession(sql, venueId, userId, message.sessionId);
  if (isHandled(session)) return session;
  if (session.table_id === message.toTableId) {
    return { result: { ok: true, alreadyDone: true, sessionId: session.id, tableId: session.table_id }, events: [], store: true };
  }
  const table = findTable(sql, venueId, message.toTableId);
  if (table === null) return refuse("TABLE_NOT_FOUND");
  if (findOpenSessionForTable(sql, venueId, message.toTableId) !== null) return refuse("TABLE_ALREADY_OPEN", false);

  sql.exec("UPDATE table_sessions SET table_id = ? WHERE id = ?", table.id, session.id);
  const actor = staff(userId);
  insertEvent(sql, { venueId, sessionId: session.id, type: "session.moved", actor, at: now, details: { fromTableId: session.table_id, toTableId: table.id } });
  const events = announceTable(sql, venueId, session.id, ordersOf(sql, session.id), table, actor, now);
  return {
    result: { ok: true, alreadyDone: false, sessionId: session.id, tableId: table.id },
    events,
    store: true,
    tables: [session.table_id, table.id],
  };
}

// ---------- merge ----------

export function mergeSession(sql: SqlStorage, venueId: string, userId: string, message: { sessionId: string; intoSessionId: string }, now: number): Handled {
  if (message.sessionId === message.intoSessionId) return refuse("SAME_SESSION");
  const source = findSession(sql, venueId, message.sessionId);
  const target = findSession(sql, venueId, message.intoSessionId);
  if (source === null || target === null) return refuse("SESSION_NOT_FOUND", false);
  if (source.status !== "open" || target.status !== "open") return refuse("SESSION_CLOSED");
  // Both tables must be yours, or you are a manager: nobody takes a colleague's table by accident.
  const holdsBoth = source.waiter_id === userId && target.waiter_id === userId;
  if (!holdsBoth && !isManagerHere(sql, venueId, userId)) return refuse("NOT_YOUR_TABLE", false);

  const moved = ordersOf(sql, source.id);
  // Rounds keep their order and come after the target's rounds, so round numbers stay unique.
  const offset = sql.exec<{ m: number }>("SELECT COALESCE(MAX(round), 0) AS m FROM orders WHERE session_id = ?", target.id).one().m;
  sql.exec("UPDATE orders SET session_id = ?, round = round + ? WHERE session_id = ?", target.id, offset, source.id);
  sql.exec("UPDATE table_sessions SET status = 'closed', closed_at = ? WHERE id = ?", now, source.id);

  const actor = staff(userId);
  insertEvent(sql, {
    venueId,
    sessionId: source.id,
    type: "session.merged",
    actor,
    at: now,
    details: { intoSessionId: target.id, fromTableId: source.table_id, intoTableId: target.table_id },
  });
  const table = findTable(sql, venueId, target.table_id) ?? { id: target.table_id, name: target.table_id };
  const events = announceTable(sql, venueId, target.id, moved, table, actor, now);
  return {
    result: { ok: true, alreadyDone: false, sessionId: target.id, tableId: target.table_id },
    events,
    store: true,
    tables: [source.table_id, target.table_id],
  };
}

// ---------- hand over ----------

export function transferSession(sql: SqlStorage, venueId: string, userId: string, message: { sessionId: string; toWaiterId: string }, now: number): Handled {
  const session = ownOpenSession(sql, venueId, userId, message.sessionId);
  if (isHandled(session)) return session;
  const receiver = sql
    .exec<{ id: string }>("SELECT id FROM staff WHERE id = ? AND venue_id = ? AND active = 1", message.toWaiterId, venueId)
    .toArray()[0];
  if (receiver === undefined) return refuse("STAFF_NOT_FOUND", false); // could be reactivated later
  if (session.waiter_id === receiver.id) {
    return { result: { ok: true, alreadyDone: true, sessionId: session.id, tableId: session.table_id }, events: [], store: true };
  }

  sql.exec("UPDATE table_sessions SET waiter_id = ? WHERE id = ?", receiver.id, session.id);
  insertEvent(sql, {
    venueId,
    sessionId: session.id,
    type: "session.transferred",
    actor: staff(userId),
    at: now,
    details: { fromWaiterId: session.waiter_id, toWaiterId: receiver.id },
  });
  const notice: Notice = {
    tags: [`waiter:${receiver.id}`],
    message: { type: "table.transferred", tableId: session.table_id, sessionId: session.id, fromWaiterId: session.waiter_id },
  };
  return {
    result: { ok: true, alreadyDone: false, sessionId: session.id, tableId: session.table_id },
    events: [],
    notices: [notice],
    store: true,
    tables: [session.table_id],
  };
}
