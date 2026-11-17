/**
 * GET /lines: the lines of the tables a waiter holds right now. Used when a waiter's tablet missed
 * too many events to replay them (sync.result reloadRequired): it replaces its confirmed lines with
 * this, then continues catch-up from `seq`, so nothing that happens during the download is lost.
 * The same tables as the waiter's catch-up (CafeDO #catchUp): open visits held by this waiter.
 */

export interface WaiterLine {
  itemId: string;
  orderId: string;
  state: string;
  /** The order's received_at (server ms). */
  at: number;
  /**
   * The `item.sent` snapshot as JSON TEXT, with the table the line is on NOW (after a move or merge)
   * and its unit price as the server stored it (the snapshot has none; a tablet never sets prices).
   * Text, like tickets.ts: an object of unknown shape can't be typed for the RPC to the Worker.
   */
  details: string;
}

/** Every line of every open visit this waiter holds, oldest round first, finished lines included. */
export function waiterLines(sql: SqlStorage, venueId: string, waiterId: string): { lines: WaiterLine[]; seq: number } {
  const rows = sql
    .exec<{ id: string; order_id: string; state: string; received_at: number; table_id: string; price_santim: number; details: string }>(
      `SELECT i.id, i.order_id, i.state, o.received_at, s.table_id, i.price_santim, e.details
         FROM order_items i
         JOIN orders o ON o.id = i.order_id
         JOIN table_sessions s ON s.id = o.session_id
         JOIN order_events e ON e.order_item_id = i.id AND e.type = 'item.sent'
        WHERE i.venue_id = ? AND s.status = 'open' AND s.waiter_id = ?
        ORDER BY o.received_at, i.order_id, i.rowid`,
      venueId,
      waiterId,
    )
    .toArray();
  // Read in the same synchronous step as the rows, so no event can slip in between (DO input gate).
  const seq = sql.exec<{ seq: number | null }>("SELECT MAX(seq) AS seq FROM order_events WHERE venue_id = ?", venueId).one().seq ?? 0;
  return {
    seq,
    lines: rows.map((r) => ({
      itemId: r.id,
      orderId: r.order_id,
      state: r.state,
      at: r.received_at,
      details: JSON.stringify({ ...(JSON.parse(r.details) as Record<string, unknown>), tableId: r.table_id, priceSantim: r.price_santim }),
    })),
  };
}
