/**
 * Live updates for every waiter (3b): sold-out items (K-05, W-10) and table states (W-02).
 * Messages are tiny (an id and a flag) to stay inside the free plan (CLAUDE.md "small messages").
 */
import type { Actor } from "../domain/itemState";
import { insertEvent, type Handled, type Notice } from "./events";

// ---------- sold out ----------

export type SoldOutResult =
  | { ok: true; menuItemId: string; soldOut: boolean; alreadyDone: boolean }
  | { ok: false; error: "MENU_ITEM_NOT_FOUND" | "WRONG_STATION" | "IDEMPOTENCY_KEY_REUSED" | "INTERNAL_ERROR" };

/** Everyone who shows the menu: all waiters, the item's station tablets, the live view. */
export function soldOutNotice(menuItemId: string, soldOut: boolean, stationId: string): Notice {
  return { tags: ["waiters", `station:${stationId}`, "live"], message: { type: "menu.sold_out", menuItemId, soldOut } };
}

/** A station marks one of ITS items sold out or back in stock. "Back in stock" is the undo. */
export function setSoldOut(
  sql: SqlStorage,
  venueId: string,
  actor: Extract<Actor, { kind: "station" }>,
  message: { menuItemId: string; soldOut: boolean },
  now: number,
): Handled {
  const done = (result: SoldOutResult, notices: Notice[] = []): Handled => ({ result, events: [], notices, store: true });
  const item = sql
    .exec<{ station_id: string; sold_out: number }>(
      "SELECT station_id, sold_out FROM menu_items WHERE id = ? AND venue_id = ? AND active = 1",
      message.menuItemId,
      venueId,
    )
    .toArray()[0];
  if (item === undefined) return done({ ok: false, error: "MENU_ITEM_NOT_FOUND" });
  if (item.station_id !== actor.stationId) return done({ ok: false, error: "WRONG_STATION" });
  const answer = { ok: true as const, menuItemId: message.menuItemId, soldOut: message.soldOut };
  if ((item.sold_out === 1) === message.soldOut) return done({ ...answer, alreadyDone: true });

  sql.exec("UPDATE menu_items SET sold_out = ? WHERE id = ?", message.soldOut ? 1 : 0, message.menuItemId);
  insertEvent(sql, { venueId, type: "menu.sold_out", actor, at: now, details: { menuItemId: message.menuItemId, soldOut: message.soldOut } });
  return done({ ...answer, alreadyDone: false }, [soldOutNotice(message.menuItemId, message.soldOut, item.station_id)]);
}

// ---------- table states ----------

export type TableState = "free" | "seated" | "ordered" | "accepted" | "ready" | "delivered";

/**
 * A table's state, always derived from its open session's items (D-03, D-74). Order of priority:
 * ready (something to pick up) > ordered (waiting for the kitchen) > accepted > delivered.
 */
export function deriveTableState(sessionOpen: boolean, itemStates: readonly string[]): TableState {
  if (!sessionOpen) return "free";
  const live = itemStates.filter((s) => s !== "cancelled" && s !== "voided");
  if (live.length === 0) return "seated";
  if (live.includes("ready")) return "ready";
  if (live.includes("sent")) return "ordered";
  if (live.includes("accepted")) return "accepted";
  return "delivered";
}

export interface TableLive {
  state: TableState;
  sessionId: string | null;
  waiterId: string | null;
}

/** The current derived state of one table. */
export function currentTableState(sql: SqlStorage, tableId: string): TableLive {
  const session = sql
    .exec<{ id: string; waiter_id: string }>("SELECT id, waiter_id FROM table_sessions WHERE table_id = ? AND status = 'open'", tableId)
    .toArray()[0];
  if (session === undefined) return { state: "free", sessionId: null, waiterId: null };
  const states = sql
    .exec<{ state: string }>("SELECT i.state FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.session_id = ?", session.id)
    .toArray()
    .map((r) => r.state);
  return { state: deriveTableState(true, states), sessionId: session.id, waiterId: session.waiter_id };
}

/** The tables touched by these items (via order → session). */
export function tablesOfItems(sql: SqlStorage, itemIds: readonly string[]): string[] {
  const tables = new Set<string>();
  for (const itemId of itemIds) {
    const row = sql
      .exec<{ table_id: string }>(
        `SELECT s.table_id FROM order_items i JOIN orders o ON o.id = i.order_id JOIN table_sessions s ON s.id = o.session_id
          WHERE i.id = ?`,
        itemId,
      )
      .toArray()[0];
    if (row !== undefined) tables.add(row.table_id);
  }
  return [...tables];
}

/**
 * Recompute the touched tables' states; for each one that changed since waiters were last told,
 * remember it and return a push. Runs inside the command's transaction.
 */
export function refreshTableStates(sql: SqlStorage, venueId: string, tableIds: readonly string[]): Notice[] {
  const notices: Notice[] = [];
  for (const tableId of new Set(tableIds)) {
    const now = currentTableState(sql, tableId);
    const last = sql
      .exec<{ state: string; session_id: string; waiter_id: string }>("SELECT state, session_id, waiter_id FROM table_live_state WHERE table_id = ?", tableId)
      .toArray()[0];
    const lastState: TableLive = last === undefined ? { state: "free", sessionId: null, waiterId: null } : { state: last.state as TableState, sessionId: last.session_id, waiterId: last.waiter_id };
    if (lastState.state === now.state && lastState.sessionId === now.sessionId && lastState.waiterId === now.waiterId) continue;

    if (now.state === "free") sql.exec("DELETE FROM table_live_state WHERE table_id = ?", tableId);
    else {
      sql.exec(
        `INSERT INTO table_live_state (table_id, venue_id, state, session_id, waiter_id) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (table_id) DO UPDATE SET state = excluded.state, session_id = excluded.session_id, waiter_id = excluded.waiter_id`,
        tableId,
        venueId,
        now.state,
        now.sessionId,
        now.waiterId,
      );
    }
    notices.push({ tags: ["waiters", "live"], message: { type: "table.state", tableId, ...now } });
  }
  return notices;
}
