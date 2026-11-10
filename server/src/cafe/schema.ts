/**
 * SQLite tables inside each café's Durable Object (design.md §7).
 *
 * STRICT tables make SQLite reject values of the wrong type instead of storing them silently.
 * Money is whole santim (INTEGER); times are milliseconds since 1970 in UTC (INTEGER);
 * yes/no values are INTEGER 0/1.
 *
 * NOTE: nothing is deployed yet, so these statements are edited in place. Before the first
 * deploy, schema changes must become numbered migrations (see docs/decisions.md D-47).
 */
export const SCHEMA: readonly string[] = [
  // ---------- set up in the dashboard (seeded directly in tests for now) ----------
  `CREATE TABLE IF NOT EXISTS menu_items (
     id            TEXT PRIMARY KEY,
     venue_id      TEXT NOT NULL,
     name          TEXT NOT NULL,
     price_santim  INTEGER NOT NULL CHECK (price_santim >= 0),
     station_id    TEXT NOT NULL,
     sold_out      INTEGER NOT NULL DEFAULT 0 CHECK (sold_out IN (0, 1)),
     active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
   ) STRICT`,

  `CREATE TABLE IF NOT EXISTS tables (
     id        TEXT PRIMARY KEY,
     venue_id  TEXT NOT NULL,
     name      TEXT NOT NULL,
     active    INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
   ) STRICT`,

  // ---------- people and devices (slice 4a) ----------
  // PINs are stored only as HMAC(SERVER_SECRET-derived key, salt:pin) (D-51).
  `CREATE TABLE IF NOT EXISTS staff (
     id                   TEXT PRIMARY KEY,
     venue_id             TEXT NOT NULL,
     name                 TEXT NOT NULL,
     role                 TEXT NOT NULL CHECK (role IN ('waiter', 'manager', 'owner')),
     pin_salt             TEXT NOT NULL,
     pin_hash             TEXT NOT NULL,
     failed_pin_attempts  INTEGER NOT NULL DEFAULT 0,
     locked_until         INTEGER,
     active               INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
   ) STRICT`,

  // token_hash is SHA-256 of the device token; NULL until paired and after revoke.
  `CREATE TABLE IF NOT EXISTS devices (
     id          TEXT PRIMARY KEY,
     venue_id    TEXT NOT NULL,
     name        TEXT NOT NULL,
     kind        TEXT NOT NULL CHECK (kind IN ('waiter', 'station')),
     station_id  TEXT,
     token_hash  TEXT UNIQUE,
     paired_at   INTEGER,
     revoked_at  INTEGER,
     CHECK ((kind = 'station') = (station_id IS NOT NULL))
   ) STRICT`,

  // A waiter signed in with a PIN on one device. Only the SHA-256 of the session token is stored.
  `CREATE TABLE IF NOT EXISTS staff_sessions (
     token_hash  TEXT PRIMARY KEY,
     venue_id    TEXT NOT NULL,
     user_id     TEXT NOT NULL,
     device_id   TEXT NOT NULL,
     created_at  INTEGER NOT NULL,
     expires_at  INTEGER NOT NULL,
     ended_at    INTEGER
   ) STRICT`,

  // ---------- service ----------
  // A table visit. waiter_id is the CURRENT waiter (changes on hand-over, slice 3c).
  `CREATE TABLE IF NOT EXISTS table_sessions (
     id         TEXT PRIMARY KEY,
     venue_id   TEXT NOT NULL,
     table_id   TEXT NOT NULL,
     waiter_id  TEXT NOT NULL,
     guests     INTEGER CHECK (guests BETWEEN 1 AND 99),
     status     TEXT NOT NULL CHECK (status IN ('open', 'closed')),
     opened_at  INTEGER NOT NULL,
     closed_at  INTEGER
   ) STRICT`,
  // The database itself guarantees at most one open session per table.
  `CREATE UNIQUE INDEX IF NOT EXISTS one_open_session_per_table
     ON table_sessions (table_id) WHERE status = 'open'`,

  // A round. waiter_id is who PLACED it (gets the sales credit, never changes).
  `CREATE TABLE IF NOT EXISTS orders (
     id                  TEXT PRIMARY KEY,
     venue_id            TEXT NOT NULL,
     session_id          TEXT NOT NULL,
     waiter_id           TEXT NOT NULL,
     round               INTEGER NOT NULL CHECK (round >= 1),
     created_at          INTEGER NOT NULL, -- device clock, for information only (D-16)
     received_at         INTEGER NOT NULL, -- server clock, authoritative
     sent_while_offline  INTEGER NOT NULL CHECK (sent_while_offline IN (0, 1)),
     conflict            TEXT CHECK (conflict IN ('table_taken', 'session_closed', 'not_your_table'))
   ) STRICT`,
  `CREATE INDEX IF NOT EXISTS orders_by_session ON orders (session_id)`,

  `CREATE TABLE IF NOT EXISTS order_items (
     id            TEXT PRIMARY KEY,
     venue_id      TEXT NOT NULL,
     order_id      TEXT NOT NULL,
     menu_item_id  TEXT NOT NULL,
     station_id    TEXT NOT NULL,
     name          TEXT NOT NULL,   -- copied from the menu when received
     price_santim  INTEGER NOT NULL CHECK (price_santim >= 0), -- copied from the menu when received
     qty           INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 99),
     note          TEXT,
     flag          TEXT CHECK (flag IN ('sold_out', 'unavailable')),
     state         TEXT NOT NULL
                   CHECK (state IN ('sent','accepted','ready','delivered','cancelled','voided')),
     -- The station's last tap, kept so it can be undone within 10 s (all NULL when there is none).
     last_tap_station_id     TEXT,
     last_tap_action         TEXT CHECK (last_tap_action IN ('accept','ready')),
     last_tap_at             INTEGER,
     last_tap_previous_state TEXT
   ) STRICT`,
  `CREATE INDEX IF NOT EXISTS order_items_by_order ON order_items (order_id)`,

  // Audit and sync log. Rows are only ever inserted, never updated or deleted.
  // seq only goes up, so a reconnecting tablet can ask for "everything after seq N".
  // Item events fill order_id/order_item_id; session events (opened/closed) fill session_id.
  `CREATE TABLE IF NOT EXISTS order_events (
     seq           INTEGER PRIMARY KEY AUTOINCREMENT,
     venue_id      TEXT NOT NULL,
     session_id    TEXT,
     order_id      TEXT,
     order_item_id TEXT,
     type          TEXT NOT NULL,
     from_state    TEXT,           -- NULL for item.sent (the item is new)
     to_state      TEXT,
     actor         TEXT NOT NULL,  -- JSON
     at            INTEGER NOT NULL,
     details       TEXT            -- JSON or NULL
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
