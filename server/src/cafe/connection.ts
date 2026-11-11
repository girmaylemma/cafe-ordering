/**
 * Who is on a WebSocket, what they may do, and what they should receive.
 *
 * SECURITY: station and staff identities come ONLY from a device token (and, for waiters, a PIN
 * session), checked by CafeDO. X-Cafe-* headers are trusted only for the internal live view, and
 * the public Worker deletes every X-Cafe-* header a client sends (D-40, tested in worker.test.ts).
 */
import type { Actor } from "../domain/itemState";
import { isId, type WireEvent } from "./protocol";

export type ConnectionIdentity =
  /** A kitchen or bar tablet. Acts as the station (D-25). */
  | { role: "station"; venueId: string; deviceId: string; stationId: string }
  /** A waiter (or manager) signed in on a tablet. */
  | { role: "staff"; venueId: string; deviceId: string; userId: string }
  /** The manager/owner live view in the dashboard. Read-only. */
  | { role: "live"; venueId: string; userId: string };

/** Prefix of internal headers; the public Worker strips every header starting with it. */
export const INTERNAL_HEADER_PREFIX = "x-cafe-";

/**
 * The internal live view (dashboard). It has no public route until Cloudflare Access is added,
 * so only internal code can send these headers. Station and staff roles are never read from headers.
 */
export function liveIdentityFromHeaders(headers: Headers): ConnectionIdentity | null {
  if (headers.get("X-Cafe-Role") !== "live") return null;
  const venueId = headers.get("X-Cafe-Venue");
  const userId = headers.get("X-Cafe-User");
  return isId(venueId) && isId(userId) ? { role: "live", venueId, userId } : null;
}

/**
 * Hibernation tags: pushes are sent to every socket carrying a tag. The device tag lets
 * revoke/deactivate find and close a device's sockets at once (D-13).
 */
export function tagsFor(identity: ConnectionIdentity): string[] {
  switch (identity.role) {
    case "station":
      return [`station:${identity.stationId}`, `device:${identity.deviceId}`];
    case "staff":
      // "waiters": sold-out and table-state pushes reach every waiter's menu and floor map (3b).
      return [`waiter:${identity.userId}`, `device:${identity.deviceId}`, "waiters"];
    case "live":
      return ["live"];
  }
}

/** The actor for commands on this connection, or null if it may not send commands. */
export function actorFor(identity: ConnectionIdentity): Actor | null {
  switch (identity.role) {
    case "station":
      return { kind: "station", stationId: identity.stationId, deviceId: identity.deviceId };
    case "staff":
      return { kind: "staff", userId: identity.userId };
    case "live":
      return null;
  }
}

/**
 * Which tags receive an item event: its station, the live view, and the table's CURRENT
 * waiter (not necessarily who placed the round, D-06). `currentWaiterId` is null for an
 * item that has no table session.
 */
export function recipientsFor(event: WireEvent, currentWaiterId: string | null): string[] {
  const tags = [`station:${event.stationId}`, "live"];
  if (currentWaiterId !== null) tags.push(`waiter:${currentWaiterId}`);
  return tags;
}
