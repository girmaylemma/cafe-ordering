/**
 * Who is on a WebSocket, what they may do, and what they should receive.
 *
 * SECURITY: the identity comes from X-Cafe-* headers set by trusted internal code.
 * Until slice 4, nothing public routes to the café (the Worker answers 404).
 * In slice 4 the Worker MUST delete any X-Cafe-* headers sent by the client and set
 * its own, only after checking the device token. Otherwise anyone could claim any identity.
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

export const IDENTITY_HEADERS = {
  venue: "X-Cafe-Venue",
  role: "X-Cafe-Role",
  device: "X-Cafe-Device",
  station: "X-Cafe-Station",
  user: "X-Cafe-User",
} as const;

export function identityFromHeaders(headers: Headers): ConnectionIdentity | null {
  const read = (name: string): string | null => {
    const value = headers.get(name);
    return isId(value) ? value : null;
  };
  const venueId = read(IDENTITY_HEADERS.venue);
  if (venueId === null) return null;
  const deviceId = read(IDENTITY_HEADERS.device);

  switch (headers.get(IDENTITY_HEADERS.role)) {
    case "station": {
      const stationId = read(IDENTITY_HEADERS.station);
      return deviceId !== null && stationId !== null ? { role: "station", venueId, deviceId, stationId } : null;
    }
    case "staff": {
      const userId = read(IDENTITY_HEADERS.user);
      return deviceId !== null && userId !== null ? { role: "staff", venueId, deviceId, userId } : null;
    }
    case "live": {
      const userId = read(IDENTITY_HEADERS.user);
      return userId !== null ? { role: "live", venueId, userId } : null;
    }
    default:
      return null;
  }
}

/** Hibernation tags: pushes are sent to every socket carrying a tag. */
export function tagsFor(identity: ConnectionIdentity): string[] {
  switch (identity.role) {
    case "station":
      return [`station:${identity.stationId}`];
    case "staff":
      return [`waiter:${identity.userId}`];
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

/** Which tags receive an item event. Waiter alerts are added in slice 3 (needs table sessions). */
export function recipientsFor(event: WireEvent): string[] {
  return [`station:${event.stationId}`, "live"];
}
