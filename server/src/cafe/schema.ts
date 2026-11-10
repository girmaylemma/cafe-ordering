/**
 * SQLite tables inside each café's Durable Object (design.md §7).
 *
 * STRICT tables make SQLite reject values of the wrong type instead of storing them silently.
 * Money is whole santim (INTEGER); times are milliseconds since 1970 in UTC (INTEGER).
 */
export const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS order_items (
     id            TEXT PRIMARY KEY,
     venue_id      TEXT NOT NULL,
     order_id      TEXT NOT NULL,
     station_id    TEXT NOT NULL,
     name          TEXT NOT NULL,
     price_santim  INTEGER NOT NULL CHECK (price_santim >= 0),
     qty           INTEGER NOT NULL CHECK (qty > 0),
     state         TEXT NOT NULL
                   CHECK (state IN ('sent','accepted','ready','delivered','cancelled','voided')),
     -- The station's last tap, kept so it can be undone within 10 s (all NULL when there is none).
     last_tap_station_id     TEXT,
     last_tap_action         TEXT CHECK (last_tap_action IN ('accept','ready')),
     last_tap_at             INTEGER,
     last_tap_previous_state TEXT
   ) STRICT`,

  // Audit and sync log. Rows are only ever inserted, never updated or deleted.
  // seq only goes up, so a reconnecting tablet can ask for "everything after seq N".
  `CREATE TABLE IF NOT EXISTS order_events (
     seq           INTEGER PRIMARY KEY AUTOINCREMENT,
     venue_id      TEXT NOT NULL,
     order_id      TEXT NOT NULL,
     order_item_id TEXT NOT NULL,
     type          TEXT NOT NULL,
     from_state    TEXT NOT NULL,
     to_state      TEXT NOT NULL,
     actor         TEXT NOT NULL, -- JSON
     at            INTEGER NOT NULL,
     details       TEXT           -- JSON or NULL
   ) STRICT`,

  // One row per handled command, so a resent command gets the same answer and is applied only once.
  `CREATE TABLE IF NOT EXISTS processed_commands (
     idempotency_key TEXT PRIMARY KEY,
     venue_id        TEXT NOT NULL,
     fingerprint     TEXT NOT NULL, -- the command as canonical JSON, to detect a reused key
     result          TEXT NOT NULL, -- JSON of the answer sent back
     at              INTEGER NOT NULL
   ) STRICT`,
];
