/**
 * The café database's migrations. APPEND ONLY: never edit or reorder a shipped migration (D-60).
 * To change the schema, add `{ version: N + 1, description, statements }` at the end.
 */
import type { Migration } from "../storage/migrations";
import { SCHEMA } from "./schema";

export const CAFE_MIGRATIONS: readonly Migration[] = [
  { version: 1, description: "initial schema (slices 1–4)", statements: SCHEMA },
];
