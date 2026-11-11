/**
 * The café database's migrations. APPEND ONLY: never edit or reorder a shipped migration (D-60).
 * To change the schema, add `{ version: N + 1, description, statements }` at the end.
 */
import type { Migration } from "../storage/migrations";
import { SCHEMA } from "./schema";

export const CAFE_MIGRATIONS: readonly Migration[] = [
  { version: 1, description: "initial schema (slices 1–4)", statements: SCHEMA },
  {
    version: 2,
    description: "venue row and staff emails for dashboard login",
    statements: [
      // One row per café database: created by the installer (POST /installer/venues).
      `CREATE TABLE venue (
         id          TEXT PRIMARY KEY,
         name        TEXT NOT NULL,
         created_at  INTEGER NOT NULL
       ) STRICT`,
      // Managers and owners with an email can sign in to the dashboard through Cloudflare Access.
      "ALTER TABLE staff ADD COLUMN email TEXT",
      "CREATE UNIQUE INDEX staff_email ON staff (email) WHERE email IS NOT NULL",
    ],
  },
  {
    version: 3,
    description: "menu categories, Amharic names, fasting tag, table details",
    statements: [
      // English name is required, Amharic optional (D-67).
      `CREATE TABLE categories (
         id          TEXT PRIMARY KEY,
         venue_id    TEXT NOT NULL,
         name_en     TEXT NOT NULL,
         name_am     TEXT,
         sort_order  INTEGER NOT NULL DEFAULT 0,
         active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
       ) STRICT`,
      // menu_items.name stays the English name (columns are never renamed, D-60).
      "ALTER TABLE menu_items ADD COLUMN category_id TEXT",
      "ALTER TABLE menu_items ADD COLUMN name_am TEXT",
      "ALTER TABLE menu_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE menu_items ADD COLUMN fasting INTEGER NOT NULL DEFAULT 0 CHECK (fasting IN (0, 1))",
      // Orders copy both names when sent (D-69).
      "ALTER TABLE order_items ADD COLUMN name_am TEXT",
      "ALTER TABLE tables ADD COLUMN area TEXT",
      "ALTER TABLE tables ADD COLUMN seats INTEGER CHECK (seats BETWEEN 1 AND 99)",
      "ALTER TABLE tables ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
    ],
  },
  {
    version: 4,
    description: "last pushed table state (push only when it changes)",
    statements: [
      // Not the source of truth: table state is always derived from items (D-03). This only
      // remembers what waiters were last told, so a change is pushed once and never repeated.
      // A free table has no row.
      `CREATE TABLE table_live_state (
         table_id    TEXT PRIMARY KEY,
         venue_id    TEXT NOT NULL,
         state       TEXT NOT NULL CHECK (state IN ('seated', 'ordered', 'accepted', 'ready', 'delivered')),
         session_id  TEXT NOT NULL,
         waiter_id   TEXT NOT NULL
       ) STRICT`,
    ],
  },
  {
    version: 5,
    description: "item options and add-ons (reusable groups, extra amounts)",
    statements: [
      // A reusable group, e.g. "Size: choose exactly 1" or "Extras: choose 0 to 2" (D-77).
      `CREATE TABLE option_groups (
         id           TEXT PRIMARY KEY,
         venue_id     TEXT NOT NULL,
         name_en      TEXT NOT NULL,
         name_am      TEXT,
         min_choices  INTEGER NOT NULL DEFAULT 0 CHECK (min_choices BETWEEN 0 AND 10),
         max_choices  INTEGER NOT NULL DEFAULT 1 CHECK (max_choices BETWEEN 1 AND 10),
         sort_order   INTEGER NOT NULL DEFAULT 0,
         active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
         CHECK (min_choices <= max_choices)
       ) STRICT`,
      // An option adds an amount to the item's price (0 for free choices like spice level).
      `CREATE TABLE options (
         id            TEXT PRIMARY KEY,
         venue_id      TEXT NOT NULL,
         group_id      TEXT NOT NULL,
         name_en       TEXT NOT NULL,
         name_am       TEXT,
         extra_santim  INTEGER NOT NULL DEFAULT 0 CHECK (extra_santim >= 0),
         sort_order    INTEGER NOT NULL DEFAULT 0,
         active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
       ) STRICT`,
      "CREATE INDEX options_by_group ON options (group_id)",
      `CREATE TABLE menu_item_option_groups (
         venue_id      TEXT NOT NULL,
         menu_item_id  TEXT NOT NULL,
         group_id      TEXT NOT NULL,
         sort_order    INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (menu_item_id, group_id)
       ) STRICT`,
      // The chosen options as sent (JSON snapshot: names and extras), like name and price (D-17).
      // price_santim of an order item is the unit price INCLUDING extras.
      "ALTER TABLE order_items ADD COLUMN options TEXT",
      "ALTER TABLE order_items ADD COLUMN options_changed INTEGER NOT NULL DEFAULT 0 CHECK (options_changed IN (0, 1))",
    ],
  },
];
