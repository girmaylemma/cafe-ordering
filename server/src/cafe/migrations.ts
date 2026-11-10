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
];
