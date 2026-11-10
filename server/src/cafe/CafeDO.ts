import { DurableObject } from "cloudflare:workers";
import {
  applyCommand,
  type Actor,
  type Command,
  type CommandError,
  type Item,
  type ItemEvent,
  type ItemState,
} from "../domain/itemState";
import { SCHEMA } from "./schema";

export interface ItemCommandInput {
  venueId: string;
  /** Made by the tablet once per tap; a resend of the same tap reuses it. */
  idempotencyKey: string;
  itemId: string;
  command: Command;
  actor: Actor;
}

export type ItemCommandError =
  | CommandError
  | "ITEM_NOT_FOUND"
  | "IDEMPOTENCY_KEY_REUSED"
  /** Something unexpected failed; nothing was saved, so the tablet may retry with the same key. */
  | "INTERNAL_ERROR";

export type ItemCommandResult =
  /** `seq` is the new event's number, or null when nothing changed (`alreadyDone`). */
  | { ok: true; alreadyDone: boolean; item: Item; seq: number | null }
  | { ok: false; error: ItemCommandError };

/** One instance per café. Holds the café's SQLite database (and, from slice 2, its WebSockets). */
export class CafeDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const statement of SCHEMA) ctx.storage.sql.exec(statement);
  }

  /**
   * Apply one item command exactly once.
   *
   * Everything happens inside one synchronous transaction with no `await`, so no other
   * command can run in between (this is what makes "first command wins" true, D-07),
   * and if any write fails, every write of this command is rolled back.
   *
   * Never throws: an unexpected failure is logged and answered with INTERNAL_ERROR.
   * Because the transaction rolled back, no idempotency record exists, so a retry is safe.
   */
  handleItemCommand(input: ItemCommandInput): ItemCommandResult {
    const now = Date.now(); // server time is authoritative (D-16)
    try {
      return this.ctx.storage.transactionSync(() => this.#handle(input, now));
    } catch (error) {
      console.error("handleItemCommand failed; transaction rolled back", {
        idempotencyKey: input.idempotencyKey,
        itemId: input.itemId,
        command: input.command.type,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, error: "INTERNAL_ERROR" };
    }
  }

  #handle(input: ItemCommandInput, now: number): ItemCommandResult {
    const sql = this.ctx.storage.sql;
    const fingerprint = canonicalJson({ itemId: input.itemId, command: input.command, actor: input.actor });

    const prior = sql
      .exec<{ fingerprint: string; result: string }>(
        "SELECT fingerprint, result FROM processed_commands WHERE idempotency_key = ?",
        input.idempotencyKey,
      )
      .toArray()[0];
    if (prior !== undefined) {
      if (prior.fingerprint !== fingerprint) return { ok: false, error: "IDEMPOTENCY_KEY_REUSED" };
      return JSON.parse(prior.result) as ItemCommandResult;
    }

    const row = sql
      .exec<ItemRow>("SELECT * FROM order_items WHERE id = ? AND venue_id = ?", input.itemId, input.venueId)
      .toArray()[0];
    // Not saved under the idempotency key: the item may simply not have arrived yet,
    // so a later resend should be checked again rather than get a stale answer.
    if (row === undefined) return { ok: false, error: "ITEM_NOT_FOUND" };

    const item = rowToItem(row);
    const result = this.#apply(row, item, input, now);

    sql.exec(
      "INSERT INTO processed_commands (idempotency_key, venue_id, fingerprint, result, at) VALUES (?, ?, ?, ?, ?)",
      input.idempotencyKey,
      input.venueId,
      fingerprint,
      JSON.stringify(result),
      now,
    );
    return result;
  }

  #apply(row: ItemRow, item: Item, input: ItemCommandInput, now: number): ItemCommandResult {
    const outcome = applyCommand(item, input.command, input.actor, now);
    if (!outcome.ok) {
      // A double tap or resend: report success without changing anything (D-35).
      if (outcome.error === "ALREADY_IN_STATE") return { ok: true, alreadyDone: true, item, seq: null };
      return outcome;
    }

    const sql = this.ctx.storage.sql;
    const next = outcome.item;
    sql.exec(
      `UPDATE order_items
          SET state = ?, last_tap_station_id = ?, last_tap_action = ?, last_tap_at = ?, last_tap_previous_state = ?
        WHERE id = ?`,
      next.state,
      next.lastTap?.stationId ?? null,
      next.lastTap?.action ?? null,
      next.lastTap?.at ?? null,
      next.lastTap?.previousState ?? null,
      next.id,
    );
    const seq = insertEvent(sql, row, outcome.event);
    return { ok: true, alreadyDone: false, item: next, seq };
  }
}

// ---------- helpers ----------

type ItemRow = {
  id: string;
  venue_id: string;
  order_id: string;
  station_id: string;
  state: string;
  last_tap_station_id: string | null;
  last_tap_action: string | null;
  last_tap_at: number | null;
  last_tap_previous_state: string | null;
};

function rowToItem(row: ItemRow): Item {
  const hasTap =
    row.last_tap_station_id !== null &&
    row.last_tap_action !== null &&
    row.last_tap_at !== null &&
    row.last_tap_previous_state !== null;
  return {
    id: row.id,
    stationId: row.station_id,
    // The table's CHECK constraints guarantee these strings are valid states and actions.
    state: row.state as ItemState,
    lastTap: hasTap
      ? {
          stationId: row.last_tap_station_id as string,
          action: row.last_tap_action as "accept" | "ready",
          at: row.last_tap_at as number,
          previousState: row.last_tap_previous_state as ItemState,
        }
      : null,
  };
}

function insertEvent(sql: SqlStorage, row: ItemRow, event: ItemEvent): number {
  const inserted = sql
    .exec<{ seq: number }>(
      `INSERT INTO order_events (venue_id, order_id, order_item_id, type, from_state, to_state, actor, at, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING seq`,
      row.venue_id,
      row.order_id,
      event.itemId,
      event.type,
      event.from,
      event.to,
      JSON.stringify(event.actor),
      event.at,
      event.details === undefined ? null : JSON.stringify(event.details),
    )
    .one();
  return inserted.seq;
}

/** JSON with object keys sorted, so the same command always gives the same string. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
