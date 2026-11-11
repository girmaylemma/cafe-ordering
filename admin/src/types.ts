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

export interface Category {
  id: string;
  nameEn: string;
  nameAm: string | null;
  sortOrder: number;
  active: boolean;
}

export interface MenuItem {
  id: string;
  categoryId: string | null;
  nameEn: string;
  nameAm: string | null;
  /** ETB as text, e.g. "42.50" (D-70). */
  price: string;
  priceSantim: number;
  stationId: string;
  fasting: boolean;
  soldOut: boolean;
  sortOrder: number;
  active: boolean;
}

export interface CafeTable {
  id: string;
  name: string;
  area: string | null;
  seats: number | null;
  sortOrder: number;
  active: boolean;
}

/** Same rule as the server (server/src/cafe/admin.ts canManage): managers can't touch owners. */
export function canManage(actorRole: string, targetRole: Role): boolean {
  return actorRole === "owner" || (actorRole === "manager" && targetRole !== "owner");
}
