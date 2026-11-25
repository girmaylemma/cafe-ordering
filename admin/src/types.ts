/** Shapes returned by the admin API (server/src/admin/routes.ts). */

/** No café owner role (D-97). */
export type Role = "waiter" | "manager";

export interface Me {
  /** hasPassword: the manager set a password (M1b); absent from older servers. */
  user: { id: string; name: string; role: string; email: string | null; hasPassword?: boolean };
  venue: { id: string; name: string | null };
}

export interface Staff {
  id: string;
  name: string;
  role: Role;
  email: string | null;
  active: boolean;
  /** Chosen by the person on the tablet; null = follows the café (F4c, read-only here). Absent from older servers. */
  language?: Language | null;
}

/** The tablet languages (F4e): English, Amharic, Afaan Oromoo, Tigrinya. */
export const LANGUAGES = ["en", "am", "om", "ti"] as const;
export type Language = (typeof LANGUAGES)[number];

export interface Venue {
  id: string;
  name: string;
  language: Language;
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
  /** Attached option groups, in order (3b). */
  optionGroupIds: string[];
}

export interface OptionChoice {
  id: string;
  groupId: string;
  nameEn: string;
  nameAm: string | null;
  /** ETB as text, e.g. "15.00". */
  extra: string;
  extraSantim: number;
  sortOrder: number;
  active: boolean;
}

export interface OptionGroup {
  id: string;
  nameEn: string;
  nameAm: string | null;
  minChoices: number;
  maxChoices: number;
  sortOrder: number;
  active: boolean;
  options: OptionChoice[];
}

export interface CafeTable {
  id: string;
  name: string;
  area: string | null;
  seats: number | null;
  sortOrder: number;
  active: boolean;
}

/** Same rule as the server (server/src/cafe/admin.ts canManage): managers manage waiters only (D-97). */
export function canManage(_actorRole: string, targetRole: Role): boolean {
  return targetRole === "waiter";
}
