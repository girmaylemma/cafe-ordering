/**
 * WebSocket messages between tablets and the café Durable Object (design.md §8).
 *
 * Every incoming message is untrusted: it is parsed into a known shape here, and any
 * field we don't know (for example a claimed `actor` or a price) is dropped. Who sent a
 * command is decided by the connection, never by the message (see connection.ts).
 */
import type { Actor, Command, ItemEventType, ItemState } from "../domain/itemState";
import type { ItemCommandResult } from "./items";
import type { SoldOutResult, TableState } from "./live";
import type { OrderSendResult, SessionCloseResult, SessionOpenResult } from "./orders";

/** Larger messages are refused. Counted in UTF-8 bytes: Amharic letters are 3 bytes each. */
export const MAX_MESSAGE_BYTES = 16 * 1024;
/** A reconnecting tablet that missed more events than this must reload instead. */
export const MAX_CATCH_UP_EVENTS = 500;

const MAX_ID_LENGTH = 100;
const MAX_REASON_LENGTH = 500;
const MAX_NOTE_LENGTH = 200;
const MAX_LINES_PER_ROUND = 50;
const MAX_QTY = 99;
const MAX_GUESTS = 99;

// ---------- tablet -> server ----------

export interface OrderLine {
  /** UUID v7 made on the tablet. */
  id: string;
  menuItemId: string;
  qty: number;
  note: string | null;
}

export interface SessionOpenMessage {
  type: "session.open";
  idempotencyKey: string;
  /** UUID v7 made on the tablet, so a queued round can refer to it before the server answers. */
  sessionId: string;
  tableId: string;
  guests: number | null;
}

export interface SessionCloseMessage {
  type: "session.close";
  idempotencyKey: string;
  sessionId: string;
}

/** A round. Its orderId doubles as the idempotency key. */
export interface OrderSendMessage {
  type: "order.send";
  orderId: string;
  sessionId: string;
  tableId: string;
  /** Device clock when the waiter tapped Send; for information only (D-16). */
  createdAt: number;
  /** True when the tablet held this round in its offline queue (D-45). */
  queuedOffline: boolean;
  items: OrderLine[];
}

/** A manager's PIN typed on the tablet to approve a void (D-57). Never stored. */
export interface ManagerApproval {
  managerId: string;
  managerPin: string;
}

export type ClientMessage =
  /**
   * For a void, `command.approvedBy` is always null here: only the server sets it, after checking
   * `approval` or the signed-in manager (D-57). `approval` is null for every other command.
   */
  | { type: "item.command"; idempotencyKey: string; itemId: string; command: Command; approval: ManagerApproval | null }
  | SessionOpenMessage
  | SessionCloseMessage
  | OrderSendMessage
  /** A kitchen/bar tablet marks one of its items sold out or back in stock (K-05). */
  | { type: "menu.sold_out"; idempotencyKey: string; menuItemId: string; soldOut: boolean }
  /** "Send me every event after `since`" (after a reconnect). */
  | { type: "sync"; since: number };

// ---------- server -> tablet ----------

/** An item event as tablets see it, both when pushed live and when caught up after a reconnect. */
export interface WireEvent {
  seq: number;
  orderId: string;
  itemId: string;
  stationId: string;
  type: ItemEventType | "item.sent";
  /** null for item.sent: the item is new. */
  from: ItemState | null;
  to: ItemState;
  actor: Actor;
  at: number;
  details?: Record<string, unknown>;
}

export type CommandResult = ItemCommandResult | SessionOpenResult | SessionCloseResult | OrderSendResult | SoldOutResult;

export type ProtocolError =
  | "INVALID_MESSAGE"
  | "MESSAGE_TOO_LARGE"
  /** This kind of connection may not send this message (e.g. a live dashboard sending a command). */
  | "NOT_ALLOWED_FOR_CONNECTION"
  /** The PIN session or device was ended, expired or revoked; the socket is closed after this. */
  | "SESSION_ENDED";

export type ServerMessage =
  | { type: "ack"; idempotencyKey: string; result: CommandResult }
  | { type: "event"; event: WireEvent }
  | { type: "sync.result"; events: WireEvent[]; reloadRequired: boolean }
  /** To every waiter, the item's station and the live view: grey the item out (or back in). */
  | { type: "menu.sold_out"; menuItemId: string; soldOut: boolean }
  /** To every waiter and the live view: a table's state on the floor map changed (W-02). */
  | { type: "table.state"; tableId: string; state: TableState; sessionId: string | null; waiterId: string | null }
  | { type: "error"; error: ProtocolError };

// ---------- parsing ----------

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; error: ProtocolError };

const invalid: ParseResult = { ok: false, error: "INVALID_MESSAGE" };

export function parseClientMessage(raw: string | ArrayBuffer): ParseResult {
  if (typeof raw !== "string") return invalid; // the protocol is JSON text only
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return { ok: false, error: "MESSAGE_TOO_LARGE" };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return invalid;
  }
  if (!isRecord(data)) return invalid;

  const message = parseMessage(data);
  return message === null ? invalid : { ok: true, message };
}

function parseMessage(data: Record<string, unknown>): ClientMessage | null {
  switch (data.type) {
    case "item.command": {
      const { idempotencyKey, itemId } = data;
      const parsed = parseCommand(data.command);
      if (!isId(idempotencyKey) || !isId(itemId) || parsed === null) return null;
      return { type: "item.command", idempotencyKey, itemId, command: parsed.command, approval: parsed.approval };
    }
    case "session.open": {
      const { idempotencyKey, sessionId, tableId, guests } = data;
      if (!isId(idempotencyKey) || !isId(sessionId) || !isId(tableId)) return null;
      if (guests !== null && !isIntBetween(guests, 1, MAX_GUESTS)) return null;
      return { type: "session.open", idempotencyKey, sessionId, tableId, guests };
    }
    case "session.close": {
      const { idempotencyKey, sessionId } = data;
      if (!isId(idempotencyKey) || !isId(sessionId)) return null;
      return { type: "session.close", idempotencyKey, sessionId };
    }
    case "order.send": {
      const { orderId, sessionId, tableId, createdAt, queuedOffline } = data;
      if (!isId(orderId) || !isId(sessionId) || !isId(tableId)) return null;
      if (!isIntBetween(createdAt, 0, Number.MAX_SAFE_INTEGER) || typeof queuedOffline !== "boolean") return null;
      const items = parseLines(data.items);
      if (items === null) return null;
      return { type: "order.send", orderId, sessionId, tableId, createdAt, queuedOffline, items };
    }
    case "menu.sold_out": {
      const { idempotencyKey, menuItemId, soldOut } = data;
      if (!isId(idempotencyKey) || !isId(menuItemId) || typeof soldOut !== "boolean") return null;
      return { type: "menu.sold_out", idempotencyKey, menuItemId, soldOut };
    }
    case "sync": {
      const { since } = data;
      if (!isIntBetween(since, 0, Number.MAX_SAFE_INTEGER)) return null;
      return { type: "sync", since };
    }
    default:
      return null;
  }
}

/** 1 to 50 lines, each with a unique id. Unknown fields (like a price) are dropped. */
function parseLines(value: unknown): OrderLine[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINES_PER_ROUND) return null;
  const lines: OrderLine[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const { id, menuItemId, qty, note } = raw;
    if (!isId(id) || !isId(menuItemId) || ids.has(id)) return null;
    if (!isIntBetween(qty, 1, MAX_QTY)) return null;
    if (note !== null && (typeof note !== "string" || note.length > MAX_NOTE_LENGTH)) return null;
    ids.add(id);
    lines.push({ id, menuItemId, qty, note });
  }
  return lines;
}

const SIMPLE_COMMANDS = ["accept", "ready", "delivered", "cancel", "undo"] as const;
type SimpleCommand = (typeof SIMPLE_COMMANDS)[number];
const isSimpleCommand = (value: unknown): value is SimpleCommand =>
  (SIMPLE_COMMANDS as readonly unknown[]).includes(value);

/** Build a fresh Command from known fields only. */
function parseCommand(value: unknown): { command: Command; approval: ManagerApproval | null } | null {
  if (!isRecord(value)) return null;
  if (isSimpleCommand(value.type)) return { command: { type: value.type }, approval: null };
  if (value.type === "void") {
    const { reason, managerId, managerPin } = value;
    if (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH) return null;
    // Refused loudly rather than dropped: an old or tampered tablet must not think it approved a void.
    if ("approvedBy" in value) return null;
    let approval: ManagerApproval | null = null;
    if (managerId !== undefined || managerPin !== undefined) {
      if (!isId(managerId) || typeof managerPin !== "string" || !/^\d{6}$/.test(managerPin)) return null;
      approval = { managerId, managerPin };
    }
    return { command: { type: "void", reason, approvedBy: null }, approval };
  }
  return null;
}

export function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isIntBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
