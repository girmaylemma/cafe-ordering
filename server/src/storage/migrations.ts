/**
 * Numbered schema migrations for a Durable Object's SQLite database (D-60).
 *
 * Rules:
 * - A migration is never edited after it ships. A schema change is a NEW migration at the end.
 * - Migrations are additive only (new tables, columns, indexes). Then a rolled-back deploy's
 *   older code still works against the newer database.
 * - Each migration runs in its own transaction: it applies completely or not at all.
 */

export interface Migration {
  version: number;
  description: string;
  statements: readonly string[];
}

/**
 * Apply every migration newer than the database. Returns the database's version afterwards.
 * Throws (loudly) if the list is malformed or a migration fails: a café on a half-applied
 * schema would be worse than a visibly broken one.
 *
 * `table` is only changed by tests, to keep their bookkeeping separate.
 */
export function runMigrations(storage: DurableObjectStorage, migrations: readonly Migration[], table = "schema_migrations"): number {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`migrations must be consecutive from 1; position ${i + 1} has version ${m.version}`);
    }
  });

  const sql = storage.sql;
  sql.exec(
    `CREATE TABLE IF NOT EXISTS ${table} (
       version     INTEGER PRIMARY KEY,
       description TEXT NOT NULL,
       applied_at  INTEGER NOT NULL
     ) STRICT`,
  );
  const current = sql.exec<{ v: number }>(`SELECT COALESCE(MAX(version), 0) AS v FROM ${table}`).one().v;
  const latest = migrations.length;

  if (current > latest) {
    // Older code after a rollback. Safe because migrations are additive; worth knowing about.
    console.warn("database schema is newer than this code", { database: current, code: latest });
    return current;
  }

  for (const migration of migrations.slice(current)) {
    try {
      storage.transactionSync(() => {
        for (const statement of migration.statements) sql.exec(statement);
        sql.exec(`INSERT INTO ${table} (version, description, applied_at) VALUES (?, ?, ?)`, migration.version, migration.description, Date.now());
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`migration ${migration.version} (${migration.description}) failed and was rolled back: ${reason}`);
    }
  }
  return latest;
}
