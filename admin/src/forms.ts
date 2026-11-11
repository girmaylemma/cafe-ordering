/** Small helpers shared by the dashboard's add/edit forms. */

/**
 * Only the fields whose value changed, so an edit sends (and the audit log records) real changes only.
 * Lists are compared by content: two arrays with the same ids are not a change.
 */
export function changedFields<T extends Record<string, unknown>>(before: T, after: T): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(after) as Array<keyof T>) {
    const same = Array.isArray(after[key]) ? JSON.stringify(after[key]) === JSON.stringify(before[key]) : after[key] === before[key];
    if (!same) changed[key] = after[key];
  }
  return changed;
}

/** ETB with at most 2 decimals, the same rule as the server (server/src/cafe/menu.ts, D-70). */
export const PRICE_PATTERN = /^\d{1,7}(\.\d{1,2})?$/;

/** "" → null, "6" → 6, anything else → undefined (invalid). */
export function optionalWholeNumber(text: string, min: number, max: number): number | null | undefined {
  const s = text.trim();
  if (s === "") return null;
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n >= min && n <= max ? n : undefined;
}

/** "" → null; anything else trimmed. */
export const optionalText = (text: string): string | null => (text.trim() === "" ? null : text.trim());
