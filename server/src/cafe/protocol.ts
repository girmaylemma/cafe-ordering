/**
 * WebSocket messages between tablets and the café Durable Object (design.md §8).
 *
 * Every incoming message is untrusted: it is parsed into a known shape here, and any
 * field we don't know (for example a claimed `actor`) is dropped. Who sent a command
 * is decided by the connection, never by the message (see connection.ts).
 */
import type { Actor, Command, ItemEventType, ItemState } from "../domain/itemState";
import type { ItemCommandResult } from "./CafeDO";

/** Larger messages are refused. Counted in UTF-8 bytes: Amharic letters are 3 bytes each. */
export const MAX_MESSAGE_BYTES = 16 * 1024;
/** A reconnecting tablet that missed more events than this must reload instead. */
export const MAX_CATCH_UP_EVENTS = 500;

const MAX_ID_LENGTH = 100;
const MAX_REASON_LENGTH = 500;

// ---------- tablet -> server ----------

export type ClientMessage =
  | { type: "item.command"; idempotencyKey: string; itemId: string; command: Command }
  /** "Send me every event after `since`" (after a reconnect). */
  | { type: "sync"; since: number };

// ---------- server -> tablet ----------

/** An item event as tablets see it, both when pushed live and when caught up after a reconnect. */
export interface WireEvent {
  seq: number;
  orderId: string;
  itemId: string;
  stationId: string;
  type: ItemEventType;
  from: ItemState;
  to: ItemState;
  actor: Actor;
  at: number;
  details?: Record<string, unknown>;
}

export type ProtocolError =
  | "INVALID_MESSAGE"
  | "MESSAGE_TOO_LARGE"
  /** This kind of connection may not send this message (e.g. a live dashboard sending a command). */
  | "NOT_ALLOWED_FOR_CONNECTION";

export type ServerMessage =
  | { type: "ack"; idempotencyKey: string; result: ItemCommandResult }
  | { type: "event"; event: WireEvent }
  | { type: "sync.result"; events: WireEvent[]; reloadRequired: boolean }
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

  switch (data.type) {
    case "item.command": {
      const { idempotencyKey, itemId } = data;
      const command = parseCommand(data.command);
      if (!isId(idempotencyKey) || !isId(itemId) || command === null) return invalid;
      return { ok: true, message: { type: "item.command", idempotencyKey, itemId, command } };
    }
    case "sync": {
      const { since } = data;
      if (typeof since !== "number" || !Number.isSafeInteger(since) || since < 0) return invalid;
      return { ok: true, message: { type: "sync", since } };
    }
    default:
      return invalid;
  }
}

const SIMPLE_COMMANDS = ["accept", "ready", "delivered", "cancel", "undo"] as const;
type SimpleCommand = (typeof SIMPLE_COMMANDS)[number];
const isSimpleCommand = (value: unknown): value is SimpleCommand =>
  (SIMPLE_COMMANDS as readonly unknown[]).includes(value);

/** Build a fresh Command from known fields only. */
function parseCommand(value: unknown): Command | null {
  if (!isRecord(value)) return null;
  if (isSimpleCommand(value.type)) return { type: value.type };
  if (value.type === "void") {
    const { reason, approvedBy } = value;
    if (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH) return null;
    if (approvedBy !== null && !isId(approvedBy)) return null;
    return { type: "void", reason, approvedBy };
  }
  return null;
}

export function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
