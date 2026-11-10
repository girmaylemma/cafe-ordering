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
];
