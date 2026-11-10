/** Item commands (accept, ready, cancel, void, delivered, undo) against the café database. */
import { applyCommand, type Actor, type Command, type CommandError, type Item, type ItemState } from "../domain/itemState";
import { insertEvent, type Handled } from "./events";
import type { WireEvent } from "./protocol";

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

export function handleItemCommand(sql: SqlStorage, input: ItemCommandInput, now: number): Handled {
  const row = sql
    .exec<ItemRow>("SELECT * FROM order_items WHERE id = ? AND venue_id = ?", input.itemId, input.venueId)
    .toArray()[0];
  // Not saved under the idempotency key: the item may simply not have arrived yet (D-39).
  if (row === undefined) return { result: { ok: false, error: "ITEM_NOT_FOUND" }, events: [], store: false };

  const item = rowToItem(row);
  const outcome = applyCommand(item, input.command, input.actor, now);
  if (!outcome.ok) {
    // A double tap or resend: report success without changing anything (D-35).
    if (outcome.error === "ALREADY_IN_STATE") {
      return { result: { ok: true, alreadyDone: true, item, seq: null }, events: [], store: true };
    }
    return { result: outcome, events: [], store: true };
  }

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
  const { type, itemId, from, to, actor, at, details } = outcome.event;
  const seq = insertEvent(sql, {
    venueId: row.venue_id,
    orderId: row.order_id,
    itemId,
    type,
    from,
    to,
    actor,
    at,
    details,
  });
  const event: WireEvent = { seq, orderId: row.order_id, itemId, stationId: row.station_id, type, from, to, actor, at };
  if (details !== undefined) event.details = details;
  return { result: { ok: true, alreadyDone: false, item: next, seq }, events: [event], store: true };
}

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
