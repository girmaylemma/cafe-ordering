/** Field checks shared by the menu, tables and options rules (dashboard input is never trusted). */

export const BAD = Symbol("invalid");
export type Bad = typeof BAD;

// ---------- field parsers: return the value, `undefined` (not given) or BAD ----------

export function requiredText(v: unknown, max: number): string | Bad {
  if (typeof v !== "string") return BAD;
  const s = v.trim();
  return s.length > 0 && s.length <= max ? s : BAD;
}

/** Optional text: missing → undefined, null or "" → null (cleared). */
export function optionalText(v: unknown, max: number): string | null | undefined | Bad {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return BAD;
  const s = v.trim();
  if (s.length === 0) return null;
  return s.length <= max ? s : BAD;
}

export function intBetween(v: unknown, min: number, max: number): number | undefined | Bad {
  if (v === undefined) return undefined;
  return typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : BAD;
}

export function bool(v: unknown): boolean | undefined | Bad {
  if (v === undefined) return undefined;
  return typeof v === "boolean" ? v : BAD;
}

/**
 * ETB as text with up to 2 decimals ("180", "42.50") → whole santim. Numbers are refused:
 * 42.5 in JSON is a binary float, and money must never pass through one.
 */
export function parsePrice(v: unknown): number | Bad {
  if (typeof v !== "string") return BAD;
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(v.trim());
  if (match === null) return BAD;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function formatPrice(santim: number): string {
  return `${Math.floor(santim / 100)}.${String(santim % 100).padStart(2, "0")}`;
}

export const anyBad = (...values: unknown[]) => values.some((v) => v === BAD);

/** UPDATE only the given columns (whose names come from this file). */
export function update(sql: SqlStorage, table: string, id: string, changes: Record<string, SqlStorageValue | undefined>): string[] {
  const entries = Object.entries(changes).filter((e): e is [string, SqlStorageValue] => e[1] !== undefined);
  if (entries.length > 0) {
    sql.exec(`UPDATE ${table} SET ${entries.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`, ...entries.map(([, v]) => v), id);
  }
  return entries.map(([c]) => c);
}

export const flag = (b: boolean | undefined) => (b === undefined ? undefined : b ? 1 : 0);
