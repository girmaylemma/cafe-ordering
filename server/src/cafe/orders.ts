/**
 * Table sessions and rounds: session.open, order.send, session.close (design.md §3, slice 3a).
 *
 * Rules decided in docs/decisions.md:
 * - Only the session's current waiter may send rounds to it or close it (D-46).
 * - A round the tablet queued while offline is never refused for a table conflict (D-45):
 *   it is attached to the table's open session (or a new one) and flagged.
 * - Prices and names are copied from the menu on the server; the tablet's are ignored (D-17).
 * - Closing is refused until every item is delivered, cancelled or voided (D-44).
 */
import type { Actor } from "../domain/itemState";
import { insertEvent, type Handled } from "./events";
import type { OrderSendMessage, SessionCloseMessage, SessionOpenMessage, WireEvent } from "./protocol";

// ---------- results ----------

type CommonError = "IDEMPOTENCY_KEY_REUSED" | "INTERNAL_ERROR";

export type SessionOpenResult =
  | { ok: true; alreadyDone: boolean; sessionId: string }
  | {
      ok: false;
      error: "TABLE_NOT_FOUND" | "TABLE_ALREADY_OPEN" | "SESSION_ID_REUSED" | "SESSION_CLOSED" | CommonError;
      /** With TABLE_ALREADY_OPEN: the session that holds the table. */
      existingSessionId?: string;
    };

export type SessionCloseResult =
  | { ok: true; alreadyDone: boolean }
  | { ok: false; error: "SESSION_NOT_FOUND" | "NOT_YOUR_TABLE" | "ITEMS_NOT_FINISHED" | CommonError };

/** Why a queued round landed somewhere other than where the tablet expected. */
export type OrderConflict = "table_taken" | "session_closed" | "not_your_table";

export interface SentItem {
  id: string;
  menuItemId: string;
  name: string;
  /** Amharic name, copied with the English one (D-69); null if the menu has none. */
  nameAm: string | null;
  priceSantim: number;
  qty: number;
  note: string | null;
  stationId: string;
  flag: "sold_out" | "unavailable" | null;
}

export type OrderSendResult =
  | { ok: true; orderId: string; sessionId: string; round: number; conflict: OrderConflict | null; items: SentItem[] }
  | {
      ok: false;
      error:
        | "UNKNOWN_MENU_ITEM"
        | "DUPLICATE_ITEM_ID"
        | "TABLE_NOT_FOUND"
        | "SESSION_NOT_FOUND"
        | "SESSION_CLOSED"
        | "NOT_YOUR_TABLE"
        | CommonError;
    };

// ---------- session.open ----------

export function openSession(
  sql: SqlStorage,
  venueId: string,
  waiterId: string,
  message: SessionOpenMessage,
  now: number,
): Handled {
  const done = (result: SessionOpenResult, store = true): Handled => ({ result, events: [], store });

  if (findTable(sql, venueId, message.tableId) === null) return done({ ok: false, error: "TABLE_NOT_FOUND" });

  const existing = findSession(sql, venueId, message.sessionId);
  if (existing !== null) {
    if (existing.table_id !== message.tableId || existing.waiter_id !== waiterId) {
      return done({ ok: false, error: "SESSION_ID_REUSED" });
    }
    if (existing.status === "closed") return done({ ok: false, error: "SESSION_CLOSED" });
    return done({ ok: true, alreadyDone: true, sessionId: existing.id });
  }

  const holder = findOpenSessionForTable(sql, venueId, message.tableId);
  if (holder !== null) {
    // Not stored: the table may be free by the time the tablet retries.
    return done({ ok: false, error: "TABLE_ALREADY_OPEN", existingSessionId: holder.id }, false);
  }

  insertSession(sql, venueId, message.sessionId, message.tableId, waiterId, message.guests, now);
  return { ...done({ ok: true, alreadyDone: false, sessionId: message.sessionId }), tables: [message.tableId] };
}

// ---------- session.close ----------

export function closeSession(
  sql: SqlStorage,
  venueId: string,
  waiterId: string,
  message: SessionCloseMessage,
  now: number,
): Handled {
  const done = (result: SessionCloseResult, store = true): Handled => ({ result, events: [], store });

  const session = findSession(sql, venueId, message.sessionId);
  // Not stored: session.open may not have arrived yet (D-39).
  if (session === null) return done({ ok: false, error: "SESSION_NOT_FOUND" }, false);
  if (session.status === "closed") return done({ ok: true, alreadyDone: true });
  // Not stored: after a hand-over (slice 3c) the answer can change.
  if (session.waiter_id !== waiterId) return done({ ok: false, error: "NOT_YOUR_TABLE" }, false);

  const unfinished = sql
    .exec<{ n: number }>(
      `SELECT COUNT(*) AS n FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE o.session_id = ? AND i.state NOT IN ('delivered', 'cancelled', 'voided')`,
      session.id,
    )
    .one().n;
  // Not stored: the same close tap succeeds once the food is delivered.
  if (unfinished > 0) return done({ ok: false, error: "ITEMS_NOT_FINISHED" }, false);

  sql.exec("UPDATE table_sessions SET status = 'closed', closed_at = ? WHERE id = ?", now, session.id);
  insertEvent(sql, {
    venueId,
    sessionId: session.id,
    type: "session.closed",
    actor: staff(waiterId),
    at: now,
    details: { tableId: session.table_id },
  });
  return { ...done({ ok: true, alreadyDone: false }), tables: [session.table_id] };
}

// ---------- order.send ----------

export function sendOrder(
  sql: SqlStorage,
  venueId: string,
  waiterId: string,
  message: OrderSendMessage,
  now: number,
): Handled {
  const refuse = (error: Extract<OrderSendResult, { ok: false }>["error"], store = true): Handled => ({
    result: { ok: false, error },
    events: [],
    store,
  });

  // 1. Everything that would make the whole round invalid is checked before writing anything.
  const menu = new Map<string, MenuRow>();
  for (const line of message.items) {
    const item = findMenuItem(sql, venueId, line.menuItemId);
    if (item === null) return refuse("UNKNOWN_MENU_ITEM");
    menu.set(item.id, item);
  }
  for (const line of message.items) {
    if (sql.exec("SELECT 1 FROM order_items WHERE id = ?", line.id).toArray().length > 0) {
      return refuse("DUPLICATE_ITEM_ID");
    }
  }
  const table = findTable(sql, venueId, message.tableId);
  if (table === null) return refuse("TABLE_NOT_FOUND");

  // 2. Which session does this round belong to?
  const target = resolveSession(sql, venueId, waiterId, message, now);
  if (!target.ok) return refuse(target.error, target.store);
  const { sessionId, conflict } = target;

  // 3. Write the round and its items.
  const round = sql
    .exec<{ next: number }>("SELECT COALESCE(MAX(round), 0) + 1 AS next FROM orders WHERE session_id = ?", sessionId)
    .one().next;
  sql.exec(
    `INSERT INTO orders (id, venue_id, session_id, waiter_id, round, created_at, received_at, sent_while_offline, conflict)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    message.orderId,
    venueId,
    sessionId,
    waiterId,
    round,
    message.createdAt,
    now,
    message.queuedOffline ? 1 : 0,
    conflict,
  );

  const actor = staff(waiterId);
  // Shown on the kitchen ticket (K-01); null only if the staff row is missing.
  const waiterName =
    sql.exec<{ name: string }>("SELECT name FROM staff WHERE id = ? AND venue_id = ?", waiterId, venueId).toArray()[0]
      ?.name ?? null;
  const items: SentItem[] = [];
  const events: WireEvent[] = [];
  for (const line of message.items) {
    const m = menu.get(line.menuItemId)!; // filled in step 1
    const flag = m.active === 0 ? "unavailable" : m.sold_out === 1 ? "sold_out" : null;
    sql.exec(
      `INSERT INTO order_items (id, venue_id, order_id, menu_item_id, station_id, name, name_am, price_santim, qty, note, flag, state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')`,
      line.id,
      venueId,
      message.orderId,
      m.id,
      m.station_id,
      m.name,
      m.name_am,
      m.price_santim,
      line.qty,
      line.note,
      flag,
    );
    // The ticket snapshot travels in the event, so a kitchen tablet catching up gets the full ticket.
    const details = {
      tableId: table.id,
      tableName: table.name,
      waiterId,
      waiterName,
      round,
      name: m.name,
      nameAm: m.name_am,
      qty: line.qty,
      note: line.note,
      flag,
      conflict,
    };
    const seq = insertEvent(sql, {
      venueId,
      sessionId,
      orderId: message.orderId,
      itemId: line.id,
      type: "item.sent",
      to: "sent",
      actor,
      at: now,
      details,
    });
    items.push({
      id: line.id,
      menuItemId: m.id,
      name: m.name,
      nameAm: m.name_am,
      priceSantim: m.price_santim,
      qty: line.qty,
      note: line.note,
      stationId: m.station_id,
      flag,
    });
    events.push({
      seq,
      orderId: message.orderId,
      itemId: line.id,
      stationId: m.station_id,
      type: "item.sent",
      from: null,
      to: "sent",
      actor,
      at: now,
      details,
    });
  }

  return { result: { ok: true, orderId: message.orderId, sessionId, round, conflict, items }, events, store: true };
}

type SessionTarget =
  | { ok: true; sessionId: string; conflict: OrderConflict | null }
  | { ok: false; error: "SESSION_NOT_FOUND" | "SESSION_CLOSED" | "NOT_YOUR_TABLE"; store: boolean };

function resolveSession(
  sql: SqlStorage,
  venueId: string,
  waiterId: string,
  message: OrderSendMessage,
  now: number,
): SessionTarget {
  const session = findSession(sql, venueId, message.sessionId);
  const usable = session !== null && session.status === "open" && session.table_id === message.tableId;

  if (usable && session.waiter_id === waiterId) return { ok: true, sessionId: session.id, conflict: null };

  if (!message.queuedOffline) {
    // A live round: the waiter is at the table and sees the error at once.
    if (usable) return { ok: false, error: "NOT_YOUR_TABLE", store: false };
    if (session === null) return { ok: false, error: "SESSION_NOT_FOUND", store: false };
    return { ok: false, error: "SESSION_CLOSED", store: true };
  }

  // A queued round is never refused for a table conflict (D-45).
  if (usable) return { ok: true, sessionId: session.id, conflict: "not_your_table" };
  const holder = findOpenSessionForTable(sql, venueId, message.tableId);
  if (holder !== null) {
    return { ok: true, sessionId: holder.id, conflict: holder.waiter_id === waiterId ? "session_closed" : "table_taken" };
  }
  // The table is free: open it for this waiter. Reuse the tablet's session id if it is unused.
  const sessionId = session === null ? message.sessionId : crypto.randomUUID();
  insertSession(sql, venueId, sessionId, message.tableId, waiterId, null, now);
  return { ok: true, sessionId, conflict: session === null ? null : "session_closed" };
}

// ---------- shared ----------

type MenuRow = { id: string; name: string; name_am: string | null; price_santim: number; station_id: string; sold_out: number; active: number };
type TableRow = { id: string; name: string };
type SessionRow = { id: string; table_id: string; waiter_id: string; status: string };

const staff = (userId: string): Actor => ({ kind: "staff", userId });

function findMenuItem(sql: SqlStorage, venueId: string, id: string): MenuRow | null {
  return (
    sql
      .exec<MenuRow>(
        "SELECT id, name, name_am, price_santim, station_id, sold_out, active FROM menu_items WHERE id = ? AND venue_id = ?",
        id,
        venueId,
      )
      .toArray()[0] ?? null
  );
}

function findTable(sql: SqlStorage, venueId: string, id: string): TableRow | null {
  return (
    sql
      .exec<TableRow>("SELECT id, name FROM tables WHERE id = ? AND venue_id = ? AND active = 1", id, venueId)
      .toArray()[0] ?? null
  );
}

function findSession(sql: SqlStorage, venueId: string, id: string): SessionRow | null {
  return (
    sql
      .exec<SessionRow>(
        "SELECT id, table_id, waiter_id, status FROM table_sessions WHERE id = ? AND venue_id = ?",
        id,
        venueId,
      )
      .toArray()[0] ?? null
  );
}

function findOpenSessionForTable(sql: SqlStorage, venueId: string, tableId: string): SessionRow | null {
  return (
    sql
      .exec<SessionRow>(
        "SELECT id, table_id, waiter_id, status FROM table_sessions WHERE table_id = ? AND venue_id = ? AND status = 'open'",
        tableId,
        venueId,
      )
      .toArray()[0] ?? null
  );
}

function insertSession(
  sql: SqlStorage,
  venueId: string,
  id: string,
  tableId: string,
  waiterId: string,
  guests: number | null,
  now: number,
): void {
  sql.exec(
    `INSERT INTO table_sessions (id, venue_id, table_id, waiter_id, guests, status, opened_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`,
    id,
    venueId,
    tableId,
    waiterId,
    guests,
    now,
  );
  insertEvent(sql, {
    venueId,
    sessionId: id,
    type: "session.opened",
    actor: staff(waiterId),
    at: now,
    details: { tableId, guests },
  });
}
