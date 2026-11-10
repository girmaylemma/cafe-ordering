/**
 * Staff, devices and PIN sessions inside a café (slice 4a).
 *
 * Everything here is synchronous SQL. The slow parts (hashing) happen in CafeDO BEFORE these run,
 * because an `await` would let other messages interleave (D-37). So the lockout check, the PIN
 * comparison and the counter update happen together, in one step, and parallel guesses all count.
 */
import { timingSafeEqualText } from "../auth/crypto";
import { insertEvent } from "./events";

export const MAX_PIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 5 * 60_000;
/**
 * Waiters stay signed in until they sign out (D-53). Until business days exist, a session also
 * ends after this long, so a forgotten tablet doesn't stay signed in for days.
 */
export const SESSION_MAX_MS = 16 * 60 * 60_000;

export type StaffRole = "waiter" | "manager" | "owner";

// A `type`, not an `interface`: SQL row types must be assignable to Record<string, SqlStorageValue>.
export type DeviceRow = {
  id: string;
  venue_id: string;
  name: string;
  kind: "waiter" | "station";
  station_id: string | null;
};

/** Waiters: 4–6 digits. Managers and owners: exactly 6 digits, because their PIN approves voids (D-11). */
export function isValidPin(role: StaffRole, pin: string): boolean {
  return role === "waiter" ? /^\d{4,6}$/.test(pin) : /^\d{6}$/.test(pin);
}

/** A paired, not revoked device with this token hash. */
export function findPairedDevice(sql: SqlStorage, tokenHash: string): DeviceRow | null {
  return (
    sql
      .exec<DeviceRow>(
        "SELECT id, venue_id, name, kind, station_id FROM devices WHERE token_hash = ? AND revoked_at IS NULL",
        tokenHash,
      )
      .toArray()[0] ?? null
  );
}

/** The signed-in user of a live session on this device, or null if ended, expired or deactivated. */
export function findLiveSession(sql: SqlStorage, sessionHash: string, deviceId: string, now: number): { userId: string } | null {
  const row = sql
    .exec<{ user_id: string }>(
      `SELECT s.user_id FROM staff_sessions s JOIN staff u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.device_id = ? AND s.ended_at IS NULL AND s.expires_at > ? AND u.active = 1`,
      sessionHash,
      deviceId,
      now,
    )
    .toArray()[0];
  return row === undefined ? null : { userId: row.user_id };
}

export type SignInResult =
  | { ok: true; sessionToken: string; user: { id: string; name: string; role: StaffRole }; expiresAt: number }
  | { ok: false; error: "UNAUTHORIZED_DEVICE" | "NOT_A_WAITER_DEVICE" | "INVALID_CREDENTIALS" }
  | { ok: false; error: "LOCKED"; retryAfterMs: number };

type StaffRow = {
  id: string;
  name: string;
  role: StaffRole;
  pin_hash: string;
  failed_pin_attempts: number;
  locked_until: number | null;
  active: number;
};

const ALL_ROLES: readonly StaffRole[] = ["waiter", "manager", "owner"];
const APPROVER_ROLES: readonly StaffRole[] = ["manager", "owner"];

export type PinCheck =
  | { ok: true; user: { id: string; name: string; role: StaffRole } }
  | { ok: false; error: "INVALID" }
  | { ok: false; error: "LOCKED"; retryAfterMs: number };

/**
 * The one place a PIN is checked: sign-in and void approval share it, so they share one lockout
 * per person (D-58). `computedHash` is null when the user wasn't found while hashing.
 *
 * A user who exists but has the wrong role gets INVALID without a failure being counted, so
 * nobody can lock a waiter out by typing their id into the manager-PIN box.
 */
export function checkPin(
  sql: SqlStorage,
  p: { venueId: string; userId: string; computedHash: string | null; allowedRoles: readonly StaffRole[]; deviceId: string | null; now: number },
): PinCheck {
  const { userId, computedHash, now } = p;
  const user = sql
    .exec<StaffRow>(
      `SELECT id, name, role, pin_hash, failed_pin_attempts, locked_until, active
         FROM staff WHERE id = ? AND venue_id = ?`,
      userId,
      p.venueId,
    )
    .toArray()[0];
  // Same answer for "no such user", "deactivated", "wrong role" and "wrong PIN".
  if (user === undefined || user.active !== 1 || computedHash === null || !p.allowedRoles.includes(user.role)) {
    return { ok: false, error: "INVALID" };
  }

  if (user.locked_until !== null && user.locked_until > now) {
    return { ok: false, error: "LOCKED", retryAfterMs: user.locked_until - now };
  }

  if (timingSafeEqualText(computedHash, user.pin_hash)) {
    sql.exec("UPDATE staff SET failed_pin_attempts = 0, locked_until = NULL WHERE id = ?", user.id);
    return { ok: true, user: { id: user.id, name: user.name, role: user.role } };
  }

  // A lock that has run out starts a fresh count.
  const previous = user.locked_until !== null ? 0 : user.failed_pin_attempts;
  const failures = previous + 1;
  if (failures >= MAX_PIN_ATTEMPTS) {
    sql.exec("UPDATE staff SET failed_pin_attempts = 0, locked_until = ? WHERE id = ?", now + LOCKOUT_MS, user.id);
    insertEvent(sql, {
      venueId: p.venueId,
      type: "auth.locked",
      actor: { kind: "staff", userId: user.id },
      at: now,
      details: { deviceId: p.deviceId },
    });
    // Telegram alert to the manager comes with the bot (D-11); for now the log and the audit event.
    console.warn("PIN lockout", { userId: user.id, deviceId: p.deviceId });
    return { ok: false, error: "LOCKED", retryAfterMs: LOCKOUT_MS };
  }
  sql.exec("UPDATE staff SET failed_pin_attempts = ?, locked_until = NULL WHERE id = ?", failures, user.id);
  return { ok: false, error: "INVALID" };
}

/** Finish a sign-in once the PIN hash is computed. */
export function completeSignIn(
  sql: SqlStorage,
  p: { device: DeviceRow; userId: string; computedHash: string | null; sessionToken: string; sessionHash: string; now: number },
): SignInResult {
  const { device, now } = p;
  const check = checkPin(sql, {
    venueId: device.venue_id,
    userId: p.userId,
    computedHash: p.computedHash,
    allowedRoles: ALL_ROLES,
    deviceId: device.id,
    now,
  });
  if (!check.ok) {
    return check.error === "LOCKED"
      ? { ok: false, error: "LOCKED", retryAfterMs: check.retryAfterMs }
      : { ok: false, error: "INVALID_CREDENTIALS" };
  }

  const { user } = check;
  const expiresAt = now + SESSION_MAX_MS;
  sql.exec(
    `INSERT INTO staff_sessions (token_hash, venue_id, user_id, device_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    p.sessionHash,
    device.venue_id,
    user.id,
    device.id,
    now,
    expiresAt,
  );
  insertEvent(sql, {
    venueId: device.venue_id,
    type: "auth.signed_in",
    actor: { kind: "staff", userId: user.id },
    at: now,
    details: { deviceId: device.id },
  });
  return { ok: true, sessionToken: p.sessionToken, user, expiresAt };
}

export type VoidApproval =
  | { ok: true; approvedBy: string }
  | { ok: false; error: "MANAGER_PIN_INVALID" | "MANAGER_APPROVAL_REQUIRED" }
  | { ok: false; error: "MANAGER_LOCKED"; retryAfterMs: number };

/**
 * Who approves a void (D-57). With a typed manager PIN: that manager, if the PIN is right.
 * Without one: the signed-in user, but only if they are an active manager or owner.
 */
export function approveVoid(
  sql: SqlStorage,
  p: {
    venueId: string;
    actorUserId: string;
    typed: { managerId: string; computedHash: string | null } | null;
    deviceId: string | null;
    now: number;
  },
): VoidApproval {
  if (p.typed === null) {
    const role = sql
      .exec<{ role: StaffRole }>("SELECT role FROM staff WHERE id = ? AND venue_id = ? AND active = 1", p.actorUserId, p.venueId)
      .toArray()[0]?.role;
    return role !== undefined && APPROVER_ROLES.includes(role)
      ? { ok: true, approvedBy: p.actorUserId }
      : { ok: false, error: "MANAGER_APPROVAL_REQUIRED" };
  }

  const check = checkPin(sql, {
    venueId: p.venueId,
    userId: p.typed.managerId,
    computedHash: p.typed.computedHash,
    allowedRoles: APPROVER_ROLES,
    deviceId: p.deviceId,
    now: p.now,
  });
  if (check.ok) return { ok: true, approvedBy: check.user.id };
  return check.error === "LOCKED"
    ? { ok: false, error: "MANAGER_LOCKED", retryAfterMs: check.retryAfterMs }
    : { ok: false, error: "MANAGER_PIN_INVALID" };
}
