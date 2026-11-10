/** Shapes returned by the admin API (server/src/admin/routes.ts). */

export type Role = "waiter" | "manager" | "owner";

export interface Me {
  user: { id: string; name: string; role: string; email: string | null };
  venue: { id: string; name: string | null };
}

export interface Staff {
  id: string;
  name: string;
  role: Role;
  email: string | null;
  active: boolean;
}

export type Station = "kitchen" | "bar";

export interface Device {
  id: string;
  name: string;
  kind: "waiter" | "station";
  stationId: string | null;
  status: "unpaired" | "paired" | "revoked";
}

export interface PairingCode {
  code: string;
  expiresAt: number;
}

/** Same rule as the server (server/src/cafe/admin.ts canManage): managers can't touch owners. */
export function canManage(actorRole: string, targetRole: Role): boolean {
  return actorRole === "owner" || (actorRole === "manager" && targetRole !== "owner");
}
