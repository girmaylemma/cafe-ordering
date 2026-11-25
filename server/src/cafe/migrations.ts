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
  {
    version: 6,
    description: "languages: the café's default and each person's own (F4b)",
    statements: [
      // Existing cafés keep English until a manager changes it (F4c).
      "ALTER TABLE venue ADD COLUMN language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('am', 'en'))",
      // NULL = follow the café's language; a waiter sets their own from the tablet.
      "ALTER TABLE staff ADD COLUMN language TEXT CHECK (language IN ('am', 'en'))",
    ],
  },
  {
    version: 7,
    description: "languages: room for Afaan Oromoo and Tigrinya (F4e, D-94)",
    statements: [
      // SQLite cannot widen the CHECK of migration 6 in place (only by rebuilding the table, which
      // D-60 rules out), so the language moves to new columns. The old ones stay, unused: a
      // rolled-back deploy still reads them.
      "ALTER TABLE venue ADD COLUMN lang TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('am', 'en', 'om', 'ti'))",
      "ALTER TABLE staff ADD COLUMN lang TEXT CHECK (lang IN ('am', 'en', 'om', 'ti'))",
      "UPDATE venue SET lang = language",
      "UPDATE staff SET lang = language",
    ],
  },
  {
    version: 8,
    description: "no owner role: owners become managers (M0, D-97)",
    statements: [
      // Nothing is deleted: PINs, emails, sessions and history stay. The CHECK still allows 'owner'
      // (it cannot be narrowed in place, D-60); the code never writes it again.
      "UPDATE staff SET role = 'manager' WHERE role = 'owner'",
    ],
  },
  {
    version: 9,
    description: "temporary PINs: a PIN set by someone else must be changed at the next sign-in (M1a)",
    statements: [
      // Existing staff keep their PINs as they are (0).
      "ALTER TABLE staff ADD COLUMN pin_must_change INTEGER NOT NULL DEFAULT 0 CHECK (pin_must_change IN (0, 1))",
    ],
  },
  {
    version: 10,
    description: "manager passwords: keyed hash and their own lockout (M1b, D-99)",
    statements: [
      // NULL = no password set yet.
      "ALTER TABLE staff ADD COLUMN password_salt TEXT",
      "ALTER TABLE staff ADD COLUMN password_hash TEXT",
      "ALTER TABLE staff ADD COLUMN failed_password_attempts INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE staff ADD COLUMN password_locked_until INTEGER",
    ],
  },
];
