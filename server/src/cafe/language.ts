/**
 * Languages (F4b, design 5.1/5.2): the café's default (`venue.lang`, set by a manager in F4c)
 * and each person's own choice (`staff.lang`, NULL = follow the café). A waiter sets their
 * own from the tablet with the `staff.language` WebSocket message; nobody can set another's.
 * Afaan Oromoo and Tigrinya came in F4e (D-94); the columns were renamed then (migration 7).
 */

export const LANGUAGES = ["am", "en", "om", "ti"] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return (LANGUAGES as readonly unknown[]).includes(value);
}

/** The café's language; 'en' when the venue row is missing (cafés made before the installer). */
export function cafeLanguage(sql: SqlStorage, venueId: string): Language {
  const row = sql.exec<{ language: string }>("SELECT lang AS language FROM venue WHERE id = ?", venueId).toArray()[0];
  return row !== undefined && isLanguage(row.language) ? row.language : "en";
}

export type LanguageResult = { ok: true; language: Language | null };

/** Set the connection's own user's language (null = follow the café). Stored under its key. */
export function setStaffLanguage(
  sql: SqlStorage,
  venueId: string,
  userId: string,
  language: Language | null,
): { result: LanguageResult; events: []; store: true } {
  sql.exec("UPDATE staff SET lang = ? WHERE id = ? AND venue_id = ?", language, userId, venueId);
  return { result: { ok: true, language }, events: [], store: true };
}
