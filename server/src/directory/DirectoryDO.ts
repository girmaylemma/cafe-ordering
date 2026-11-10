/**
 * The one system-wide Durable Object (name "directory", D-09): answers "which café is this?" for
 * requests that don't say. In slice 4a that is only pairing codes; Telegram chats and dashboard
 * emails come later. It never stores orders.
 *
 * Pairing codes are 6 digits and live 10 minutes (D-14). A wrong guess can't be tied to the code
 * it was aimed at, so guessing is limited per IP and globally (D-52), not per code.
 */
import { DurableObject } from "cloudflare:workers";

export const PAIRING_CODE_TTL_MS = 10 * 60_000;
export const MAX_FAILURES_PER_IP_PER_HOUR = 5;
export const MAX_FAILURES_GLOBAL_PER_HOUR = 100;
const HOUR_MS = 60 * 60_000;
const GLOBAL_BUCKET = "*";

export type RedeemResult =
  | { ok: true; venueId: string; deviceId: string }
  | { ok: false; error: "INVALID_CODE" | "RATE_LIMITED" };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS pairing_codes (
     code        TEXT PRIMARY KEY,
     venue_id    TEXT NOT NULL,
     device_id   TEXT NOT NULL,
     expires_at  INTEGER NOT NULL,
     used_at     INTEGER
   ) STRICT`,
  // Failed attempts per IP (and the global "*" bucket) in the current hour.
  `CREATE TABLE IF NOT EXISTS pairing_failures (
     bucket        TEXT PRIMARY KEY,
     window_start  INTEGER NOT NULL,
     failures      INTEGER NOT NULL
   ) STRICT`,
];

export class DirectoryDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const statement of SCHEMA) ctx.storage.sql.exec(statement);
  }

  /** A new code for one device; any older code for that device stops working. */
  createPairingCode(venueId: string, deviceId: string): { code: string; expiresAt: number } {
    const now = Date.now();
    const sql = this.ctx.storage.sql;
    return this.ctx.storage.transactionSync(() => {
      sql.exec("DELETE FROM pairing_codes WHERE expires_at <= ? OR used_at IS NOT NULL OR device_id = ?", now, deviceId);
      for (;;) {
        const code = sixDigits();
        // Codes must be unique among live codes; with few live codes a clash is very rare.
        if (sql.exec("SELECT 1 FROM pairing_codes WHERE code = ?", code).toArray().length > 0) continue;
        const expiresAt = now + PAIRING_CODE_TTL_MS;
        sql.exec(
          "INSERT INTO pairing_codes (code, venue_id, device_id, expires_at) VALUES (?, ?, ?, ?)",
          code,
          venueId,
          deviceId,
          expiresAt,
        );
        return { code, expiresAt };
      }
    });
  }

  /** Use a code once. Limits are checked first, so a blocked IP learns nothing about the code. */
  redeemPairingCode(code: string, ip: string): RedeemResult {
    const now = Date.now();
    const sql = this.ctx.storage.sql;
    return this.ctx.storage.transactionSync((): RedeemResult => {
      if (
        failuresThisHour(sql, ip, now) >= MAX_FAILURES_PER_IP_PER_HOUR ||
        failuresThisHour(sql, GLOBAL_BUCKET, now) >= MAX_FAILURES_GLOBAL_PER_HOUR
      ) {
        return { ok: false, error: "RATE_LIMITED" };
      }

      const row = /^\d{6}$/.test(code)
        ? sql
            .exec<{ venue_id: string; device_id: string }>(
              "SELECT venue_id, device_id FROM pairing_codes WHERE code = ? AND used_at IS NULL AND expires_at > ?",
              code,
              now,
            )
            .toArray()[0]
        : undefined;

      if (row === undefined) {
        recordFailure(sql, ip, now);
        recordFailure(sql, GLOBAL_BUCKET, now);
        return { ok: false, error: "INVALID_CODE" };
      }
      sql.exec("UPDATE pairing_codes SET used_at = ? WHERE code = ?", now, code);
      return { ok: true, venueId: row.venue_id, deviceId: row.device_id };
    });
  }
}

function sixDigits(): string {
  // Rejection sampling avoids the small bias of `random % 1_000_000`.
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  for (;;) {
    const [n] = crypto.getRandomValues(new Uint32Array(1));
    if (n! < limit) return String(n! % 1_000_000).padStart(6, "0");
  }
}

function failuresThisHour(sql: SqlStorage, bucket: string, now: number): number {
  const row = sql
    .exec<{ window_start: number; failures: number }>(
      "SELECT window_start, failures FROM pairing_failures WHERE bucket = ?",
      bucket,
    )
    .toArray()[0];
  return row !== undefined && now - row.window_start < HOUR_MS ? row.failures : 0;
}

function recordFailure(sql: SqlStorage, bucket: string, now: number): void {
  const current = failuresThisHour(sql, bucket, now);
  // A new window starts when the old one is over an hour old.
  const windowStart =
    current === 0
      ? now
      : sql.exec<{ window_start: number }>("SELECT window_start FROM pairing_failures WHERE bucket = ?", bucket).one()
          .window_start;
  sql.exec(
    `INSERT INTO pairing_failures (bucket, window_start, failures) VALUES (?, ?, ?)
     ON CONFLICT (bucket) DO UPDATE SET window_start = excluded.window_start, failures = excluded.failures`,
    bucket,
    windowStart,
    current + 1,
  );
}
