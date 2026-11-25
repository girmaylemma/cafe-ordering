/**
 * Manager passwords (M1b, D-99): they unlock the app's management screens (M2). Stored only as a
 * keyed hash (`passwordHash`, its own derived key) with a per-person salt, like PINs: the free
 * plan's CPU limit cannot fit a strong slow hash, so the server secret is what protects a stolen
 * database. The password has its OWN lockout counter: wrong passwords never lock PIN sign-in, and
 * wrong PINs never lock the password.
 *
 * Synchronous SQL only: the hashes are computed before (D-37), as for PINs.
 */
import { timingSafeEqualText } from "../auth/crypto";
import { LOCKOUT_MS, MAX_PIN_ATTEMPTS } from "./auth";
import { insertEvent } from "./events";

/**
 * The rule (D-99, chosen by the project's owner): 8 to 128 characters counted as Unicode code points,
 * with at least one letter (any script: Amharic letters count, and have no upper/lower case), one
 * number, and one symbol (anything that is not a letter, a number or a space).
 */
export function isValidPassword(password: string): boolean {
  const characters = [...password];
  if (characters.length < 8 || characters.length > 128) return false;
  const letter = /\p{L}/u.test(password);
  const number = /\p{Nd}/u.test(password);
  const symbol = characters.some((c) => !/[\p{L}\p{Nd}\s]/u.test(c));
  return letter && number && symbol;
}

type PasswordRow = { password_hash: string | null; failed_password_attempts: number; password_locked_until: number | null };

function passwordRow(sql: SqlStorage, venueId: string, userId: string): PasswordRow | null {
  return (
    sql
      .exec<PasswordRow>(
        `SELECT password_hash, failed_password_attempts, password_locked_until
           FROM staff WHERE id = ? AND venue_id = ? AND active = 1 AND role = 'manager'`,
        userId,
        venueId,
      )
      .toArray()[0] ?? null
  );
}

export type PasswordCheck = { ok: true } | { ok: false; error: "INVALID" } | { ok: false; error: "LOCKED"; retryAfterMs: number };

/**
 * The one place a password is checked (M1b; the management unlock uses it in M2). The lockout
 * logic of checkPin, on the password's own columns. No password set, or nothing typed
 * (`computedHash` null): INVALID without counting.
 */
export function checkPassword(sql: SqlStorage, p: { venueId: string; userId: string; computedHash: string | null; now: number }): PasswordCheck {
  const row = passwordRow(sql, p.venueId, p.userId);
  if (row === null || row.password_hash === null || p.computedHash === null) return { ok: false, error: "INVALID" };
  if (row.password_locked_until !== null && row.password_locked_until > p.now) {
    return { ok: false, error: "LOCKED", retryAfterMs: row.password_locked_until - p.now };
  }
  if (timingSafeEqualText(p.computedHash, row.password_hash)) {
    sql.exec("UPDATE staff SET failed_password_attempts = 0, password_locked_until = NULL WHERE id = ?", p.userId);
    return { ok: true };
  }
  // A lock that has run out starts a fresh count.
  const failures = (row.password_locked_until !== null ? 0 : row.failed_password_attempts) + 1;
  if (failures >= MAX_PIN_ATTEMPTS) {
    sql.exec("UPDATE staff SET failed_password_attempts = 0, password_locked_until = ? WHERE id = ?", p.now + LOCKOUT_MS, p.userId);
    insertEvent(sql, { venueId: p.venueId, type: "auth.password_locked", actor: { kind: "staff", userId: p.userId }, at: p.now, details: {} });
    // The Telegram alert comes with the bot (D-11), like PIN lockouts.
    console.warn("Password lockout", { userId: p.userId });
    return { ok: false, error: "LOCKED", retryAfterMs: LOCKOUT_MS };
  }
  sql.exec("UPDATE staff SET failed_password_attempts = ?, password_locked_until = NULL WHERE id = ?", failures, p.userId);
  return { ok: false, error: "INVALID" };
}

export type SetPasswordResult =
  | { ok: true }
  | { ok: false; error: "INVALID_CREDENTIALS" | "INVALID_PASSWORD" | "SAME_PASSWORD" }
  | { ok: false; error: "LOCKED"; retryAfterMs: number };

/**
 * A manager sets their first password, or changes it (then the current one is required and
 * checked, with the lockout). Hashes computed before: `currentHash` (typed current password with
 * the stored salt, null if none typed or none set), `newWithOldSalt` (to refuse the same one),
 * `newSalt` + `newHash` (stored).
 */
export function setOwnPassword(
  sql: SqlStorage,
  p: {
    venueId: string;
    userId: string;
    newPassword: string;
    currentHash: string | null;
    newWithOldSalt: string | null;
    newSalt: string;
    newHash: string;
    now: number;
  },
): SetPasswordResult {
  const row = passwordRow(sql, p.venueId, p.userId);
  if (row === null) return { ok: false, error: "INVALID_CREDENTIALS" };
  const hadPassword = row.password_hash !== null;
  if (hadPassword) {
    const check = checkPassword(sql, { venueId: p.venueId, userId: p.userId, computedHash: p.currentHash, now: p.now });
    if (!check.ok) return check.error === "LOCKED" ? check : { ok: false, error: "INVALID_CREDENTIALS" };
  }
  if (!isValidPassword(p.newPassword)) return { ok: false, error: "INVALID_PASSWORD" };
  if (hadPassword && p.newWithOldSalt !== null && timingSafeEqualText(p.newWithOldSalt, row.password_hash!)) {
    return { ok: false, error: "SAME_PASSWORD" };
  }

  sql.exec(
    "UPDATE staff SET password_salt = ?, password_hash = ?, failed_password_attempts = 0, password_locked_until = NULL WHERE id = ?",
    p.newSalt,
    p.newHash,
    p.userId,
  );
  insertEvent(sql, {
    venueId: p.venueId,
    type: hadPassword ? "auth.password_changed" : "auth.password_set",
    actor: { kind: "staff", userId: p.userId },
    at: p.now,
    details: {},
  });
  return { ok: true };
}
