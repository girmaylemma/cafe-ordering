/**
 * Dashboard (admin) rules inside a café: who may do what (design.md §2 permissions matrix),
 * listings without secrets, and the audit trail of admin actions.
 */
import { insertEvent } from "./events";
import type { StaffRole } from "./auth";

export type AdminError =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_PIN"
  | "EMAIL_TAKEN"
  | "CANNOT_DEACTIVATE_SELF"
  | "ALREADY_PAIRED"
  | "DEVICE_REVOKED"
  | "VENUE_EXISTS"
  | "TABLE_IN_USE"
  | "INVALID_CREDENTIALS"
  | "INVALID_PASSWORD"
  | "SAME_PASSWORD"
  | "LOCKED";

/** `retryAfterMs` comes with LOCKED (M1b). */
export type AdminResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: AdminError; retryAfterMs?: number };

export const fail = (error: AdminError): { ok: false; error: AdminError } => ({ ok: false, error });

export type AdminActor = { id: string; venue_id: string; name: string; role: "manager"; email: string | null };

/** The signed-in dashboard user, if they are still an active manager in this café. */
export function findAdmin(sql: SqlStorage, userId: string): AdminActor | null {
  return (
    sql
      .exec<AdminActor>(
        "SELECT id, venue_id, name, role, email FROM staff WHERE id = ? AND active = 1 AND role = 'manager'",
        userId,
      )
      .toArray()[0] ?? null
  );
}

/**
 * Managers manage waiters only (D-97). Managers are created and reset only by the developer
 * (installer tools now, the developer console in M4). Since managers cannot deactivate managers
 * and nobody deactivates themselves, a café always keeps an active manager.
 */
export function canManage(_actorRole: AdminActor["role"], targetRole: StaffRole): boolean {
  return targetRole === "waiter";
}

export type StaffRow = { id: string; name: string; role: StaffRole; email: string | null; active: number };

export function findStaff(sql: SqlStorage, venueId: string, id: string): StaffRow | null {
  return (
    sql
      .exec<StaffRow>("SELECT id, name, role, email, active FROM staff WHERE id = ? AND venue_id = ?", id, venueId)
      .toArray()[0] ?? null
  );
}

/** Staff for the dashboard: never any PIN data. */
export function listStaff(sql: SqlStorage, venueId: string) {
  return sql
    .exec<StaffRow & { language: string | null }>(
      "SELECT id, name, role, email, active, lang AS language FROM staff WHERE venue_id = ? ORDER BY name, id",
      venueId,
    )
    .toArray()
    // language: the person's own choice from the tablet (null = follows the café), shown read-only (F4c).
    .map((s) => ({ id: s.id, name: s.name, role: s.role, email: s.email, active: s.active === 1, language: s.language }));
}

export type DeviceStatus = "unpaired" | "paired" | "revoked";

export function listDevices(sql: SqlStorage, venueId: string) {
  return sql
    .exec<{ id: string; name: string; kind: "waiter" | "station"; station_id: string | null; token_hash: string | null; revoked_at: number | null }>(
      "SELECT id, name, kind, station_id, token_hash, revoked_at FROM devices WHERE venue_id = ? ORDER BY name, id",
      venueId,
    )
    .toArray()
    .map((d) => ({ id: d.id, name: d.name, kind: d.kind, stationId: d.station_id, status: deviceStatus(d) }));
}

export function deviceStatus(d: { token_hash: string | null; revoked_at: number | null }): DeviceStatus {
  return d.revoked_at !== null ? "revoked" : d.token_hash !== null ? "paired" : "unpaired";
}

export function deviceVenue(sql: SqlStorage, deviceId: string): string | null {
  return sql.exec<{ venue_id: string }>("SELECT venue_id FROM devices WHERE id = ?", deviceId).toArray()[0]?.venue_id ?? null;
}

/** Every admin action goes to the audit log with who did it (CLAUDE.md data rules). */
export function audit(sql: SqlStorage, actor: AdminActor, type: string, details: Record<string, unknown>): void {
  insertEvent(sql, { venueId: actor.venue_id, type, actor: { kind: "staff", userId: actor.id }, at: Date.now(), details });
}

/** A plain, conservative email check; Cloudflare Access does the real ownership proof. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
