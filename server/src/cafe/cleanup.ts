/**
 * Daily cleanup of bookkeeping rows (D-61), run by the café Durable Object's alarm.
 * Only technical tables are cleaned. Orders, items and events are business records (D-19)
 * and are never deleted here.
 */

const DAY_MS = 24 * 60 * 60_000;

export const CLEANUP_INTERVAL_MS = DAY_MS;
/** How long a command's answer is kept for resends (the idempotency window). */
export const KEEP_PROCESSED_COMMANDS_MS = 7 * DAY_MS;
/** How long ended or expired PIN sessions are kept (sign-ins stay in the audit log). */
export const KEEP_FINISHED_SESSIONS_MS = 7 * DAY_MS;

export function cleanupCafe(sql: SqlStorage, now: number): { processedCommands: number; sessions: number } {
  const processedCommands = sql.exec("DELETE FROM processed_commands WHERE at < ?", now - KEEP_PROCESSED_COMMANDS_MS).rowsWritten;
  const cutoff = now - KEEP_FINISHED_SESSIONS_MS;
  const sessions = sql.exec(
    "DELETE FROM staff_sessions WHERE (ended_at IS NOT NULL AND ended_at < ?) OR expires_at < ?",
    cutoff,
    cutoff,
  ).rowsWritten;
  return { processedCommands, sessions };
}
