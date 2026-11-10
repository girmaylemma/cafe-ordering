import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { CAFE_MIGRATIONS } from "../src/cafe/migrations";
import { DIRECTORY_MIGRATIONS } from "../src/directory/DirectoryDO";
import { runMigrations, type Migration } from "../src/storage/migrations";
import { newCafe, sql } from "./helpers";

const m1: Migration = { version: 1, description: "notes table", statements: ["CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL) STRICT"] };
const m2: Migration = { version: 2, description: "add pinned", statements: ["ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"] };

/**
 * Run `fn` against a real Durable Object's storage, in tables that don't clash with the café's.
 * (A fresh café already has its own migrations applied, so the test lists use a separate table
 * name for their bookkeeping.)
 */
function withStorage<T>(fn: (storage: DurableObjectStorage) => T): Promise<T> {
  return runInDurableObject(newCafe(), (_instance, state) => fn(state.storage));
}

const TABLE = "test_migrations";
const versions = (storage: DurableObjectStorage) =>
  storage.sql.exec<{ version: number }>(`SELECT version FROM ${TABLE} ORDER BY version`).toArray().map((r) => r.version);

describe("runMigrations", () => {
  it("applies every migration to a fresh database and records them; a second run does nothing", async () => {
    await withStorage((storage) => {
      expect(runMigrations(storage, [m1, m2], TABLE)).toBe(2);
      expect(versions(storage)).toEqual([1, 2]);
      storage.sql.exec("INSERT INTO notes (id, body) VALUES ('n1', 'hello')");

      expect(runMigrations(storage, [m1, m2], TABLE)).toBe(2);
      expect(versions(storage)).toEqual([1, 2]);
      expect(storage.sql.exec("SELECT COUNT(*) AS n FROM notes").one().n).toBe(1);
    });
  });

  it("upgrades an older database with only the missing migrations, keeping its data", async () => {
    await withStorage((storage) => {
      runMigrations(storage, [m1], TABLE);
      storage.sql.exec("INSERT INTO notes (id, body) VALUES ('n1', 'kept')");

      runMigrations(storage, [m1, m2], TABLE);

      expect(storage.sql.exec("SELECT id, body, pinned FROM notes").toArray()).toEqual([{ id: "n1", body: "kept", pinned: 0 }]);
    });
  });

  it("a failing migration rolls back completely, including its earlier statements, and throws", async () => {
    const broken: Migration = {
      version: 2,
      description: "half good",
      statements: ["CREATE TABLE extra (id TEXT) STRICT", "THIS IS NOT SQL"],
    };
    await withStorage((storage) => {
      runMigrations(storage, [m1], TABLE);

      expect(() => runMigrations(storage, [m1, broken], TABLE)).toThrow();

      expect(versions(storage)).toEqual([1]);
      expect(storage.sql.exec("SELECT name FROM sqlite_master WHERE name = 'extra'").toArray()).toEqual([]);
    });
  });

  it("refuses a list with gaps or wrong order before touching the database", async () => {
    const gap: Migration = { ...m2, version: 3 };
    await withStorage((storage) => {
      expect(() => runMigrations(storage, [m1, gap], TABLE)).toThrow(/consecutive/);
      expect(storage.sql.exec("SELECT name FROM sqlite_master WHERE name = 'notes'").toArray()).toEqual([]);
    });
  });

  it("a database newer than the code logs a warning and keeps working (rolled-back deploy)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await withStorage((storage) => {
        runMigrations(storage, [m1, m2], TABLE);
        expect(runMigrations(storage, [m1], TABLE)).toBe(2);
      });
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("the real migration lists", () => {
  it.each([
    ["café", CAFE_MIGRATIONS],
    ["directory", DIRECTORY_MIGRATIONS],
  ])("the %s migrations are numbered 1..n", (_name, list) => {
    expect(list.map((m) => m.version)).toEqual(list.map((_m, i) => i + 1));
  });

  it("a new café is at the latest version", async () => {
    const rows = await sql<{ version: number }>(newCafe(), "SELECT version FROM schema_migrations ORDER BY version");
    expect(rows.map((r) => r.version)).toEqual(CAFE_MIGRATIONS.map((m) => m.version));
  });
});
