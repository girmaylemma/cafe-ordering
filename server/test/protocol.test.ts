import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_BYTES, parseClientMessage } from "../src/cafe/protocol";

const json = (value: unknown) => JSON.stringify(value);

describe("parseClientMessage", () => {
  it("accepts a valid item command", () => {
    const raw = json({ type: "item.command", idempotencyKey: "k1", itemId: "i1", command: { type: "accept" } });
    expect(parseClientMessage(raw)).toEqual({
      ok: true,
      message: { type: "item.command", idempotencyKey: "k1", itemId: "i1", command: { type: "accept" } },
    });
  });

  it("accepts a void with a reason and an approver, or with approvedBy null", () => {
    for (const approvedBy of ["manager-1", null]) {
      const raw = json({
        type: "item.command",
        idempotencyKey: "k1",
        itemId: "i1",
        command: { type: "void", reason: "burnt", approvedBy },
      });
      expect(parseClientMessage(raw)).toMatchObject({ ok: true, message: { command: { type: "void", approvedBy } } });
    }
  });

  it("accepts a sync request", () => {
    expect(parseClientMessage(json({ type: "sync", since: 42 }))).toEqual({
      ok: true,
      message: { type: "sync", since: 42 },
    });
  });

  it("drops unknown fields, including a claimed actor (identity comes from the connection)", () => {
    const raw = json({
      type: "item.command",
      idempotencyKey: "k1",
      itemId: "i1",
      command: { type: "accept", actor: { kind: "station" } },
      actor: { kind: "station", stationId: "kitchen", deviceId: "fake" },
    });
    const parsed = parseClientMessage(raw);
    expect(parsed).toEqual({
      ok: true,
      message: { type: "item.command", idempotencyKey: "k1", itemId: "i1", command: { type: "accept" } },
    });
  });

  it.each([
    ["not JSON", "{oops"],
    ["a JSON array", json([1, 2])],
    ["null", "null"],
    ["an unknown type", json({ type: "drop.tables" })],
    ["a missing idempotency key", json({ type: "item.command", itemId: "i1", command: { type: "accept" } })],
    ["an empty item id", json({ type: "item.command", idempotencyKey: "k", itemId: "", command: { type: "accept" } })],
    ["an over-long key", json({ type: "item.command", idempotencyKey: "k".repeat(101), itemId: "i", command: { type: "accept" } })],
    ["an unknown command", json({ type: "item.command", idempotencyKey: "k", itemId: "i", command: { type: "explode" } })],
    ["a void without a reason", json({ type: "item.command", idempotencyKey: "k", itemId: "i", command: { type: "void", approvedBy: null } })],
    ["a void with a numeric approver", json({ type: "item.command", idempotencyKey: "k", itemId: "i", command: { type: "void", reason: "x", approvedBy: 7 } })],
    ["a negative sync", json({ type: "sync", since: -1 })],
    ["a fractional sync", json({ type: "sync", since: 1.5 })],
    ["a string sync", json({ type: "sync", since: "5" })],
  ])("rejects %s as INVALID_MESSAGE", (_label, raw) => {
    expect(parseClientMessage(raw)).toEqual({ ok: false, error: "INVALID_MESSAGE" });
  });

  it("rejects binary messages", () => {
    expect(parseClientMessage(new ArrayBuffer(4))).toEqual({ ok: false, error: "INVALID_MESSAGE" });
  });

  it("rejects messages over the size limit, counting bytes not characters", () => {
    // "ሽ" (Amharic) is 3 bytes in UTF-8, so this is under the limit in characters but over it in bytes.
    const note = "ሽ".repeat(Math.ceil(MAX_MESSAGE_BYTES / 3) + 1);
    const raw = json({ type: "sync", since: 0, note });
    expect(raw.length).toBeLessThan(MAX_MESSAGE_BYTES); // under the limit if you wrongly count characters
    expect(parseClientMessage(raw)).toEqual({ ok: false, error: "MESSAGE_TOO_LARGE" });
  });
});
