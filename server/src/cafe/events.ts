/** Writing to and reading from the order_events log (audit + sync). */
import type { Actor, ItemState } from "../domain/itemState";
import type { CommandResult, ServerMessage, WireEvent } from "./protocol";

/**
 * What a command handler returns: the answer for the sender, the events to push after
 * commit, and whether the answer is saved under the idempotency key (D-39).
 * Only freshly stored events are listed, so a replay is never pushed twice.
 */
export interface Handled {
  result: CommandResult;
  events: WireEvent[];
  store: boolean;
  /** Other small pushes after commit (sold-out, table states), each with the tags that receive it. */
  notices?: Notice[];
  /** Tables whose state may have changed without an item event (session opened or closed). */
  tables?: string[];
}

export interface Notice {
  tags: string[];
  message: ServerMessage;
}

export interface NewEvent {
  venueId: string;
  sessionId?: string | null;
  orderId?: string | null;
  itemId?: string | null;
  type: string;
  from?: string | null;
  to?: string | null;
  actor: Actor;
  at: number;
  details?: Record<string, unknown> | undefined;
}

/** Insert one event and return its seq. */
export function insertEvent(sql: SqlStorage, e: NewEvent): number {
  return sql
    .exec<{ seq: number }>(
      `INSERT INTO order_events (venue_id, session_id, order_id, order_item_id, type, from_state, to_state, actor, at, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING seq`,
      e.venueId,
      e.sessionId ?? null,
      e.orderId ?? null,
      e.itemId ?? null,
      e.type,
      e.from ?? null,
      e.to ?? null,
      JSON.stringify(e.actor),
      e.at,
      e.details === undefined ? null : JSON.stringify(e.details),
    )
    .one().seq;
}

/** Columns selected for catch-up; item events only (joined to order_items for the station). */
export type EventRow = {
  seq: number;
  order_id: string;
  order_item_id: string;
  station_id: string;
  type: string;
  from_state: string | null;
  to_state: string;
  actor: string;
  at: number;
  details: string | null;
};

export const EVENT_COLUMNS = `e.seq, e.order_id, e.order_item_id, i.station_id, e.type, e.from_state, e.to_state,
  e.actor, e.at, e.details`;

export function rowToWireEvent(row: EventRow): WireEvent {
  // Rows are only ever written by insertEvent from validated events, so these casts hold.
  const event: WireEvent = {
    seq: row.seq,
    orderId: row.order_id,
    itemId: row.order_item_id,
    stationId: row.station_id,
    type: row.type as WireEvent["type"],
    from: row.from_state as ItemState | null,
    to: row.to_state as ItemState,
    actor: JSON.parse(row.actor) as Actor,
    at: row.at,
  };
  if (row.details !== null) event.details = JSON.parse(row.details) as Record<string, unknown>;
  return event;
}
