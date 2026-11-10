import { describe, expect, it } from "vitest";
import {
  applyCommand,
  deriveOrderStatus,
  UNDO_WINDOW_MS,
  type Actor,
  type Item,
  type ItemState,
} from "../src/domain/itemState";

// ---------- helpers ----------
const T0 = 1_700_000_000_000; // fixed "now"; tests never read the real clock

const kitchen: Actor = { kind: "station", stationId: "kitchen", deviceId: "dev-k1" };
const bar: Actor = { kind: "station", stationId: "bar", deviceId: "dev-b1" };
const waiter: Actor = { kind: "staff", userId: "hana" };

function newItem(state: ItemState = "sent"): Item {
  return { id: "item-1", stationId: "kitchen", state, lastTap: null };
}

/** Apply a command and fail the test if it was refused. */
function mustApply(...args: Parameters<typeof applyCommand>) {
  const result = applyCommand(...args);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

function errorOf(result: ReturnType<typeof applyCommand>) {
  return result.ok ? "ok" : result.error;
}

// ---------- happy path ----------
describe("happy path", () => {
  it("moves sent -> accepted -> ready -> delivered with one event per step", () => {
    const a = mustApply(newItem(), { type: "accept" }, kitchen, T0);
    const r = mustApply(a.item, { type: "ready" }, kitchen, T0 + 60_000);
    const d = mustApply(r.item, { type: "delivered" }, waiter, T0 + 90_000);

    expect([a.item.state, r.item.state, d.item.state]).toEqual(["accepted", "ready", "delivered"]);
    expect([a.event.type, r.event.type, d.event.type]).toEqual([
      "item.accepted",
      "item.ready",
      "item.delivered",
    ]);
    expect(a.event).toMatchObject({ itemId: "item-1", from: "sent", to: "accepted", actor: kitchen, at: T0 });
  });

  it("does not mutate the item it was given", () => {
    const item = newItem();
    mustApply(item, { type: "accept" }, kitchen, T0);
    expect(item.state).toBe("sent");
  });

  it("waiter can cancel before the kitchen accepts", () => {
    const c = mustApply(newItem(), { type: "cancel" }, waiter, T0);
    expect(c.item.state).toBe("cancelled");
    expect(c.event.type).toBe("item.cancelled");
  });

  it("manager-approved void with a reason works from accepted and from ready", () => {
    for (const state of ["accepted", "ready"] as const) {
      const v = mustApply(
        newItem(state),
        { type: "void", reason: "customer changed mind", approvedBy: "manager-1" },
        waiter,
        T0,
      );
      expect(v.item.state).toBe("voided");
      expect(v.event).toMatchObject({
        type: "item.voided",
        details: { reason: "customer changed mind", approvedBy: "manager-1" },
      });
    }
  });

  it("waiter can mark delivered straight from accepted; the event records that Ready was skipped", () => {
    const d = mustApply(newItem("accepted"), { type: "delivered" }, waiter, T0);
    expect(d.item.state).toBe("delivered");
    expect(d.event.details).toEqual({ skippedReady: true });
  });

  it("delivered from ready does not flag a skip", () => {
    const d = mustApply(newItem("ready"), { type: "delivered" }, waiter, T0);
    expect(d.event.details).toBeUndefined();
  });
});

// ---------- undo ----------
describe("undo", () => {
  it("undo of Accept returns the item to sent", () => {
    const a = mustApply(newItem(), { type: "accept" }, kitchen, T0);
    const u = mustApply(a.item, { type: "undo" }, kitchen, T0 + 5_000);
    expect(u.item.state).toBe("sent");
    expect(u.event).toMatchObject({ type: "item.undone", from: "accepted", to: "sent" });
  });

  it("undo of Ready returns the item to accepted", () => {
    const a = mustApply(newItem(), { type: "accept" }, kitchen, T0);
    const r = mustApply(a.item, { type: "ready" }, kitchen, T0 + 60_000);
    const u = mustApply(r.item, { type: "undo" }, kitchen, T0 + 65_000);
    expect(u.item.state).toBe("accepted");
  });

  it("works just inside the window and is refused at exactly the window", () => {
    const a = mustApply(newItem(), { type: "accept" }, kitchen, T0);
    expect(errorOf(applyCommand(a.item, { type: "undo" }, kitchen, T0 + UNDO_WINDOW_MS - 1))).toBe("ok");
    expect(errorOf(applyCommand(a.item, { type: "undo" }, kitchen, T0 + UNDO_WINDOW_MS))).toBe("UNDO_EXPIRED");
  });

  it("is refused for a different station", () => {
    const a = mustApply(newItem(), { type: "accept" }, kitchen, T0);
    expect(errorOf(applyCommand(a.item, { type: "undo" }, bar, T0 + 1_000))).toBe("WRONG_STATION");
  });

  it("is refused from a waiter", () => {
    const a = mustApply(newItem(), { type: "accept" }, kitchen, T0);
    expect(errorOf(applyCommand(a.item, { type: "undo" }, waiter, T0 + 1_000))).toBe("WRONG_ACTOR");
  });

  it("a second undo in a row is refused (only the last tap can be undone)", () => {
    const a = mustApply(newItem(), { type: "accept" }, kitchen, T0);
    const r = mustApply(a.item, { type: "ready" }, kitchen, T0 + 1_000);
    const u = mustApply(r.item, { type: "undo" }, kitchen, T0 + 2_000);
    expect(errorOf(applyCommand(u.item, { type: "undo" }, kitchen, T0 + 3_000))).toBe("NOTHING_TO_UNDO");
  });

  it("is refused once a waiter has acted on the item since the tap", () => {
    const r = mustApply(newItem("accepted"), { type: "ready" }, kitchen, T0);
    const d = mustApply(r.item, { type: "delivered" }, waiter, T0 + 1_000);
    expect(errorOf(applyCommand(d.item, { type: "undo" }, kitchen, T0 + 2_000))).toBe("NOTHING_TO_UNDO");
  });

  it("is refused on an item no station has tapped", () => {
    expect(errorOf(applyCommand(newItem(), { type: "undo" }, kitchen, T0))).toBe("NOTHING_TO_UNDO");
  });
});

// ---------- failure cases ----------
describe("refused commands", () => {
  it("cancel after accept needs a manager void", () => {
    for (const state of ["accepted", "ready"] as const) {
      expect(errorOf(applyCommand(newItem(state), { type: "cancel" }, waiter, T0))).toBe("NEEDS_MANAGER_VOID");
    }
  });

  it("void without manager approval is refused", () => {
    const r = applyCommand(newItem("accepted"), { type: "void", reason: "burnt", approvedBy: null }, waiter, T0);
    expect(errorOf(r)).toBe("VOID_NEEDS_APPROVAL");
  });

  it("void without a real reason is refused", () => {
    for (const reason of ["", "   "]) {
      const r = applyCommand(newItem("accepted"), { type: "void", reason, approvedBy: "manager-1" }, waiter, T0);
      expect(errorOf(r)).toBe("VOID_NEEDS_REASON");
    }
  });

  it("void is refused before accept (use cancel) and after delivery (decision D-32)", () => {
    const cmd = { type: "void", reason: "x", approvedBy: "manager-1" } as const;
    expect(errorOf(applyCommand(newItem("sent"), cmd, waiter, T0))).toBe("NOT_ALLOWED_FROM_STATE");
    expect(errorOf(applyCommand(newItem("delivered"), cmd, waiter, T0))).toBe("NOT_ALLOWED_FROM_STATE");
  });

  it("ready before accept is refused", () => {
    expect(errorOf(applyCommand(newItem("sent"), { type: "ready" }, kitchen, T0))).toBe("NOT_ALLOWED_FROM_STATE");
  });

  it("delivered before accept is refused", () => {
    expect(errorOf(applyCommand(newItem("sent"), { type: "delivered" }, waiter, T0))).toBe("NOT_ALLOWED_FROM_STATE");
  });

  it("a waiter cannot accept or mark ready; a station cannot cancel, void or deliver", () => {
    expect(errorOf(applyCommand(newItem(), { type: "accept" }, waiter, T0))).toBe("WRONG_ACTOR");
    expect(errorOf(applyCommand(newItem("accepted"), { type: "ready" }, waiter, T0))).toBe("WRONG_ACTOR");
    expect(errorOf(applyCommand(newItem(), { type: "cancel" }, kitchen, T0))).toBe("WRONG_ACTOR");
    expect(errorOf(applyCommand(newItem("ready"), { type: "delivered" }, kitchen, T0))).toBe("WRONG_ACTOR");
    expect(
      errorOf(applyCommand(newItem("accepted"), { type: "void", reason: "x", approvedBy: "m" }, kitchen, T0)),
    ).toBe("WRONG_ACTOR");
  });

  it("the bar cannot accept a kitchen item", () => {
    expect(errorOf(applyCommand(newItem(), { type: "accept" }, bar, T0))).toBe("WRONG_STATION");
  });

  it("nothing can change a cancelled or voided item", () => {
    for (const state of ["cancelled", "voided"] as const) {
      expect(errorOf(applyCommand(newItem(state), { type: "accept" }, kitchen, T0))).toBe("NOT_ALLOWED_FROM_STATE");
      expect(errorOf(applyCommand(newItem(state), { type: "delivered" }, waiter, T0))).toBe("NOT_ALLOWED_FROM_STATE");
    }
  });

  it("repeating a command returns ALREADY_IN_STATE (a double tap or a resend after reconnect)", () => {
    expect(errorOf(applyCommand(newItem("accepted"), { type: "accept" }, kitchen, T0))).toBe("ALREADY_IN_STATE");
    expect(errorOf(applyCommand(newItem("ready"), { type: "ready" }, kitchen, T0))).toBe("ALREADY_IN_STATE");
    expect(errorOf(applyCommand(newItem("delivered"), { type: "delivered" }, waiter, T0))).toBe("ALREADY_IN_STATE");
    expect(errorOf(applyCommand(newItem("cancelled"), { type: "cancel" }, waiter, T0))).toBe("ALREADY_IN_STATE");
    expect(
      errorOf(applyCommand(newItem("voided"), { type: "void", reason: "x", approvedBy: "m" }, waiter, T0)),
    ).toBe("ALREADY_IN_STATE");
  });
});

// ---------- order status ----------
describe("deriveOrderStatus", () => {
  const items = (...states: ItemState[]) => states.map((state) => ({ state }));

  it("is the least advanced active item", () => {
    expect(deriveOrderStatus(items("ready", "accepted"))).toBe("accepted");
    expect(deriveOrderStatus(items("sent", "ready"))).toBe("sent");
  });

  it("is ready only when every active item is ready or delivered", () => {
    expect(deriveOrderStatus(items("ready", "ready"))).toBe("ready");
    expect(deriveOrderStatus(items("ready", "delivered"))).toBe("ready");
    expect(deriveOrderStatus(items("delivered", "delivered"))).toBe("delivered");
  });

  it("ignores cancelled and voided items", () => {
    expect(deriveOrderStatus(items("ready", "cancelled", "voided"))).toBe("ready");
  });

  it("is empty when every item was cancelled or voided, or there are no items", () => {
    expect(deriveOrderStatus(items("cancelled", "voided"))).toBe("empty");
    expect(deriveOrderStatus([])).toBe("empty");
  });
});
