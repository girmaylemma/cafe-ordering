import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CLEANUP_INTERVAL_MS, KEEP_PROCESSED_COMMANDS_MS } from "../src/cafe/cleanup";
import { VENUE, newCafe, sql } from "./helpers";

const DAY = 24 * 60 * 60_000;

describe("café cleanup alarm", () => {
  it("a new café schedules its daily cleanup", async () => {
    const cafe = newCafe();
    const alarm = await runInDurableObject(cafe, (_i, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
  });

  it("deletes idempotency records and finished sessions older than 7 days, keeps recent ones, and reschedules", async () => {
    const cafe = newCafe();
    const now = Date.now();
    const old = now - KEEP_PROCESSED_COMMANDS_MS - DAY;
    const recent = now - DAY;
    for (const [key, at] of [
      ["old-key", old],
      ["recent-key", recent],
    ] as const) {
      await sql(cafe, "INSERT INTO processed_commands (idempotency_key, venue_id, fingerprint, result, at) VALUES (?, ?, '{}', '{}', ?)", key, VENUE, at);
    }
    const session = (hash: string, expires: number, ended: number | null) =>
      sql(
        cafe,
        `INSERT INTO staff_sessions (token_hash, venue_id, user_id, device_id, created_at, expires_at, ended_at)
         VALUES (?, ?, 'hana', 'dev-1', ?, ?, ?)`,
        hash,
        VENUE,
        old,
        expires,
        ended,
      );
    await session("ended-long-ago", now + DAY, old);
    await session("expired-long-ago", old, null);
    await session("live", now + DAY, null);
    await session("ended-yesterday", now + DAY, recent);
    // Business records must never be touched by cleanup.
    await sql(cafe, "INSERT INTO order_events (venue_id, type, actor, at) VALUES (?, 'auth.signed_in', '{}', ?)", VENUE, old);

    expect(await runDurableObjectAlarm(cafe)).toBe(true);

    expect((await sql<{ k: string }>(cafe, "SELECT idempotency_key AS k FROM processed_commands")).map((r) => r.k)).toEqual(["recent-key"]);
    expect((await sql<{ h: string }>(cafe, "SELECT token_hash AS h FROM staff_sessions ORDER BY h")).map((r) => r.h)).toEqual([
      "ended-yesterday",
      "live",
    ]);
    expect(await sql(cafe, "SELECT COUNT(*) AS n FROM order_events")).toEqual([{ n: 1 }]);
    const next = await runInDurableObject(cafe, (_i, state) => state.storage.getAlarm());
    expect(next).toBeGreaterThan(now + CLEANUP_INTERVAL_MS - 60_000);
  });
});

describe("directory cleanup alarm", () => {
  it("deletes used or expired pairing codes and old rate-limit windows, keeps live ones", async () => {
    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName("directory"));
    const now = Date.now();
    const tag = crypto.randomUUID().slice(0, 8); // keys unique to this test (the directory is shared)
    await runInDurableObject(directory, (_i, state) => {
      const exec = state.storage.sql.exec.bind(state.storage.sql);
      exec("INSERT INTO pairing_codes (code, venue_id, device_id, expires_at, used_at) VALUES (?, 'v', 'd', ?, NULL)", `x${tag}-expired`, now - 1);
      exec("INSERT INTO pairing_codes (code, venue_id, device_id, expires_at, used_at) VALUES (?, 'v', 'd', ?, ?)", `x${tag}-used`, now + DAY, now);
      exec("INSERT INTO pairing_codes (code, venue_id, device_id, expires_at, used_at) VALUES (?, 'v', 'd', ?, NULL)", `x${tag}-live`, now + DAY);
      exec("INSERT INTO pairing_failures (bucket, window_start, failures) VALUES (?, ?, 3)", `ip-${tag}-old`, now - 2 * 60 * 60_000);
      exec("INSERT INTO pairing_failures (bucket, window_start, failures) VALUES (?, ?, 3)", `ip-${tag}-current`, now - 60_000);
    });

    expect(await runDurableObjectAlarm(directory)).toBe(true);

    const left = await runInDurableObject(directory, (_i, state) => ({
      codes: state.storage.sql.exec<{ code: string }>("SELECT code FROM pairing_codes WHERE code LIKE ?", `x${tag}-%`).toArray().map((r) => r.code),
      buckets: state.storage.sql.exec<{ bucket: string }>("SELECT bucket FROM pairing_failures WHERE bucket LIKE ?", `ip-${tag}-%`).toArray().map((r) => r.bucket),
    }));
    expect(left).toEqual({ codes: [`x${tag}-live`], buckets: [`ip-${tag}-current`] });
  });
});
