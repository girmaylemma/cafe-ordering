/**
 * Order item state machine (design.md §3 "Order lifecycle", decisions D-03..D-07, D-32, D-33).
 *
 * Pure functions only: no clock, no storage, no network. The caller passes `now`
 * (server time) and saves the returned item and event. This keeps every rule
 * testable in milliseconds and identical on every device that calls it.
 *
 *   sent ──► accepted ──► ready ──► delivered
 *     │          │  └─────────────────▲ (waiter, Ready skipped)
 *     ▼          ▼          ▼
 *   cancelled  voided ◄─────┘
 */

export type ItemState = "sent" | "accepted" | "ready" | "delivered" | "cancelled" | "voided";

/** Who sent the command. Kitchen and bar tablets act as a station, not as a person (D-25). */
export type Actor =
  | { kind: "staff"; userId: string }
  | { kind: "station"; stationId: string; deviceId: string };

export type Command =
  | { type: "accept" }
  | { type: "ready" }
  | { type: "delivered" }
  | { type: "cancel" }
  /** `approvedBy` is the manager's user ID after their PIN was checked; null if no approval. */
  | { type: "void"; reason: string; approvedBy: string | null }
  | { type: "undo" };

/** The station's most recent tap on this item, kept so it can be undone. */
export interface LastTap {
  stationId: string;
  action: "accept" | "ready";
  at: number;
  previousState: ItemState;
}

export interface Item {
  id: string;
  stationId: string;
  state: ItemState;
  lastTap: LastTap | null;
}

export type ItemEventType =
  | "item.accepted"
  | "item.ready"
  | "item.delivered"
  | "item.cancelled"
  | "item.voided"
  | "item.undone";

export interface ItemEvent {
  type: ItemEventType;
  itemId: string;
  from: ItemState;
  to: ItemState;
  actor: Actor;
  at: number;
  details?: Record<string, unknown>;
}

export type CommandError =
  /** The command is not possible from the item's current state. */
  | "NOT_ALLOWED_FROM_STATE"
  /** The item is already in the state this command leads to (double tap or resend). */
  | "ALREADY_IN_STATE"
  /** A waiter tried a station action, or a station tried a waiter action. */
  | "WRONG_ACTOR"
  /** The station does not own this item (e.g. the bar accepting a kitchen item). */
  | "WRONG_STATION"
  /** Cancel after the kitchen accepted: the waiter must ask for a manager void. */
  | "NEEDS_MANAGER_VOID"
  | "VOID_NEEDS_APPROVAL"
  | "VOID_NEEDS_REASON"
  | "NOTHING_TO_UNDO"
  | "UNDO_EXPIRED";

export type CommandResult =
  | { ok: true; item: Item; event: ItemEvent }
  | { ok: false; error: CommandError };

/** A station can undo its last tap for this long (D-05). */
export const UNDO_WINDOW_MS = 10_000;

const fail = (error: CommandError): CommandResult => ({ ok: false, error });

/**
 * Decide whether `command` may be applied to `item`, and if so return the new item
 * and the event to store. Never mutates `item`.
 */
export function applyCommand(item: Item, command: Command, actor: Actor, now: number): CommandResult {
  switch (command.type) {
    case "accept":
    case "ready":
      return stationTap(item, command.type, actor, now);
    case "undo":
      return undo(item, actor, now);
    case "cancel":
      return cancel(item, actor, now);
    case "void":
      return voidItem(item, command, actor, now);
    case "delivered":
      return delivered(item, actor, now);
  }
}

/** Order status is the least advanced item that still counts (D-03). */
export type OrderStatus = "sent" | "accepted" | "ready" | "delivered" | "empty";

const PROGRESS: Record<"sent" | "accepted" | "ready" | "delivered", number> = {
  sent: 0,
  accepted: 1,
  ready: 2,
  delivered: 3,
};

/**
 * Cancelled and voided items are ignored. An order with no remaining items is "empty".
 * So an order is "ready" when every remaining item is ready or delivered.
 */
export function deriveOrderStatus(items: ReadonlyArray<Pick<Item, "state">>): OrderStatus {
  let least: OrderStatus = "empty";
  for (const { state } of items) {
    if (state === "cancelled" || state === "voided") continue;
    if (least === "empty" || PROGRESS[state] < PROGRESS[least]) least = state;
  }
  return least;
}

// ---------- individual commands ----------

function stationTap(item: Item, action: "accept" | "ready", actor: Actor, now: number): CommandResult {
  if (actor.kind !== "station") return fail("WRONG_ACTOR");
  if (actor.stationId !== item.stationId) return fail("WRONG_STATION");

  const [from, to]: [ItemState, ItemState] = action === "accept" ? ["sent", "accepted"] : ["accepted", "ready"];
  if (item.state === to) return fail("ALREADY_IN_STATE");
  if (item.state !== from) return fail("NOT_ALLOWED_FROM_STATE");

  return {
    ok: true,
    item: { ...item, state: to, lastTap: { stationId: actor.stationId, action, at: now, previousState: from } },
    event: { type: action === "accept" ? "item.accepted" : "item.ready", itemId: item.id, from, to, actor, at: now },
  };
}

function undo(item: Item, actor: Actor, now: number): CommandResult {
  if (actor.kind !== "station") return fail("WRONG_ACTOR");
  if (actor.stationId !== item.stationId) return fail("WRONG_STATION");

  const tap = item.lastTap;
  // The tap is only undoable while the item is still in the state that tap produced.
  // Any later change (a waiter delivering it, a manager voiding it) clears lastTap.
  if (tap === null) return fail("NOTHING_TO_UNDO");
  if (now - tap.at >= UNDO_WINDOW_MS) return fail("UNDO_EXPIRED");

  return {
    ok: true,
    // lastTap is cleared, so a second undo in a row is refused.
    item: { ...item, state: tap.previousState, lastTap: null },
    event: {
      type: "item.undone",
      itemId: item.id,
      from: item.state,
      to: tap.previousState,
      actor,
      at: now,
      details: { undid: tap.action },
    },
  };
}

function cancel(item: Item, actor: Actor, now: number): CommandResult {
  if (actor.kind !== "staff") return fail("WRONG_ACTOR");
  if (item.state === "cancelled") return fail("ALREADY_IN_STATE");
  if (item.state === "accepted" || item.state === "ready") return fail("NEEDS_MANAGER_VOID");
  if (item.state !== "sent") return fail("NOT_ALLOWED_FROM_STATE");

  return staffChange(item, "cancelled", "item.cancelled", actor, now);
}

function voidItem(
  item: Item,
  command: Extract<Command, { type: "void" }>,
  actor: Actor,
  now: number,
): CommandResult {
  if (actor.kind !== "staff") return fail("WRONG_ACTOR");
  if (item.state === "voided") return fail("ALREADY_IN_STATE");
  // Before accept the waiter cancels instead; after delivery voids are not allowed (D-32).
  if (item.state !== "accepted" && item.state !== "ready") return fail("NOT_ALLOWED_FROM_STATE");
  if (command.approvedBy === null) return fail("VOID_NEEDS_APPROVAL");
  const reason = command.reason.trim();
  if (reason === "") return fail("VOID_NEEDS_REASON");

  return staffChange(item, "voided", "item.voided", actor, now, { reason, approvedBy: command.approvedBy });
}

function delivered(item: Item, actor: Actor, now: number): CommandResult {
  if (actor.kind !== "staff") return fail("WRONG_ACTOR");
  if (item.state === "delivered") return fail("ALREADY_IN_STATE");
  if (item.state === "ready") return staffChange(item, "delivered", "item.delivered", actor, now);
  // The kitchen forgot to tap Ready but the food went out anyway (D-33).
  if (item.state === "accepted") {
    return staffChange(item, "delivered", "item.delivered", actor, now, { skippedReady: true });
  }
  return fail("NOT_ALLOWED_FROM_STATE");
}

/** A waiter or manager action: it always ends the station's chance to undo. */
function staffChange(
  item: Item,
  to: ItemState,
  type: ItemEventType,
  actor: Actor,
  now: number,
  details?: Record<string, unknown>,
): CommandResult {
  const event: ItemEvent = { type, itemId: item.id, from: item.state, to, actor, at: now };
  if (details !== undefined) event.details = details;
  return { ok: true, item: { ...item, state: to, lastTap: null }, event };
}
