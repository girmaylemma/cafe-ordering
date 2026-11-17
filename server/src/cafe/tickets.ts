/**
 * GET /tickets: a kitchen or bar tablet's open rounds (F3a fix). Used when a tablet missed too
 * many events to replay them (sync.result reloadRequired): it replaces its tickets with this,
 * then continues catch-up from `seq`, so nothing that happens during the download is lost.
 */

export interface StationTicket {
  itemId: string;
  orderId: string;
  state: string;
  /** The order's received_at (server ms): ticket timers count from it. */
  receivedAt: number;
  /**
   * The `item.sent` ticket snapshot as JSON TEXT, with the table the round is on NOW (after any move).
   * Text, like auditLog's details: an object of unknown shape can't be typed for the RPC to the Worker.
   */
  details: string;
}

/** Every item of each round that still has something open for this station, oldest round first. */
export function stationTickets(sql: SqlStorage, venueId: string, stationId: string): { tickets: StationTicket[]; seq: number } {
  const rows = sql
    .exec<{ id: string; order_id: string; state: string; received_at: number; table_id: string; table_name: string; details: string }>(
      `SELECT i.id, i.order_id, i.state, o.received_at, t.id AS table_id, t.name AS table_name, e.details
         FROM order_items i
         JOIN orders o ON o.id = i.order_id
         JOIN table_sessions s ON s.id = o.session_id
         JOIN tables t ON t.id = s.table_id
         JOIN order_events e ON e.order_item_id = i.id AND e.type = 'item.sent'
        WHERE i.venue_id = ? AND i.station_id = ?
          AND i.order_id IN (SELECT order_id FROM order_items
                              WHERE venue_id = ? AND station_id = ? AND state IN ('sent', 'accepted', 'ready'))
        ORDER BY o.received_at, i.order_id, i.rowid`,
      venueId,
      stationId,
      venueId,
      stationId,
    )
    .toArray();
  // Read in the same synchronous step as the rows, so no event can slip in between (DO input gate).
  const seq = sql.exec<{ seq: number | null }>("SELECT MAX(seq) AS seq FROM order_events WHERE venue_id = ?", venueId).one().seq ?? 0;
  return {
    seq,
    tickets: rows.map((r) => ({
      itemId: r.id,
      orderId: r.order_id,
      state: r.state,
      receivedAt: r.received_at,
      details: JSON.stringify({ ...(JSON.parse(r.details) as Record<string, unknown>), tableId: r.table_id, tableName: r.table_name }),
    })),
  };
}
