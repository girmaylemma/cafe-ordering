/** Manager-approved voids (slice 4b, D-57..D-59). */
import { describe, expect, it } from "vitest";
import { VENUE, connect, ensureStaff, newCafe, seedMenu, seedTables, sql, staffHeaders, stationHeaders, type Cafe } from "./helpers";

const MANAGER_PIN = "123456"; // what ensureStaff gives managers and owners

let counter = 0;
const uid = (prefix: string) => `${prefix}-${++counter}`;

type Tablet = Awaited<ReturnType<typeof connect>>;

/** A café with an accepted item on Table 7, sent by `waiterId`, and a manager "abebe". */
async function setup(waiterId = "hana", waiterRole: "waiter" | "manager" = "waiter") {
  const cafe = newCafe();
  await seedMenu(cafe);
  await seedTables(cafe);
  await ensureStaff(cafe, "abebe", "manager");
  const waiter = await connect(cafe, staffHeaders(waiterId, waiterRole));
  const kitchen = await connect(cafe, stationHeaders("kitchen"));

  const sessionId = uid("session");
  waiter.send({ type: "session.open", idempotencyKey: uid("key"), sessionId, tableId: "table-7", guests: null });
  await waiter.ack();
  const itemId = uid("oi");
  waiter.send({
    type: "order.send",
    orderId: uid("order"),
    sessionId,
    tableId: "table-7",
    createdAt: Date.now(),
    queuedOffline: false,
    items: [{ id: itemId, menuItemId: "menu-shiro", qty: 1, note: null }],
  });
  await waiter.ack();
  kitchen.send({ type: "item.command", idempotencyKey: uid("key"), itemId, command: { type: "accept" } });
  await kitchen.ack();
  return { cafe, waiter, kitchen, itemId };
}

function voidMessage(itemId: string, approval: Record<string, unknown> = { managerId: "abebe", managerPin: MANAGER_PIN }, key = uid("key")) {
  return { type: "item.command", idempotencyKey: key, itemId, command: { type: "void", reason: "customer changed mind", ...approval } };
}

async function voidVia(tablet: Tablet, message: unknown) {
  tablet.send(message);
  return (await tablet.ack()).result;
}

const itemState = async (cafe: Cafe, itemId: string) =>
  (await sql<{ state: string }>(cafe, "SELECT state FROM order_items WHERE id = ?", itemId))[0]?.state;

// ---------- approved ----------
describe("voids with a manager PIN", () => {
  it("the right manager PIN voids the item; the server records the manager and the reason", async () => {
    const { cafe, waiter, itemId } = await setup();

    expect(await voidVia(waiter, voidMessage(itemId))).toMatchObject({ ok: true, item: { state: "voided" } });

    const [event] = await sql<{ actor: string; details: string }>(cafe, "SELECT actor, details FROM order_events WHERE type = 'item.voided'");
    expect(JSON.parse(event!.actor)).toEqual({ kind: "staff", userId: "hana" });
    expect(JSON.parse(event!.details)).toEqual({ reason: "customer changed mind", approvedBy: "abebe" });
  });

  it("an owner's PIN can approve too", async () => {
    const { cafe, waiter, itemId } = await setup();
    await ensureStaff(cafe, "owner-1", "owner");
    expect(await voidVia(waiter, voidMessage(itemId, { managerId: "owner-1", managerPin: MANAGER_PIN }))).toMatchObject({ ok: true });
  });

  it("the PIN never reaches the database", async () => {
    const { cafe, waiter, itemId } = await setup();
    await voidVia(waiter, voidMessage(itemId));

    for (const table of ["processed_commands", "order_events", "order_items"]) {
      const rows = await sql(cafe, `SELECT * FROM ${table}`);
      expect(JSON.stringify(rows)).not.toContain(MANAGER_PIN);
    }
  });

  it("a successful void sent twice is applied once", async () => {
    const { cafe, waiter, itemId } = await setup();
    const message = voidMessage(itemId);
    const first = await voidVia(waiter, message);
    expect(await voidVia(waiter, message)).toEqual(first);
    expect(await sql(cafe, "SELECT COUNT(*) AS n FROM order_events WHERE type = 'item.voided'")).toEqual([{ n: 1 }]);
  });
});

// ---------- refused ----------
describe("refused approvals", () => {
  it.each([
    ["a wrong PIN", { managerId: "abebe", managerPin: "654321" }],
    ["an unknown manager", { managerId: "nobody", managerPin: MANAGER_PIN }],
    ["a waiter's id and PIN (waiters can't approve)", { managerId: "meron", managerPin: "123456" }],
  ])("%s gets MANAGER_PIN_INVALID and changes nothing", async (_label, approval) => {
    const { cafe, waiter, itemId } = await setup();
    await cafe.createStaff({ venueId: VENUE, id: "meron", name: "Meron", role: "waiter", pin: "123456" });

    expect(await voidVia(waiter, voidMessage(itemId, approval))).toEqual({ ok: false, error: "MANAGER_PIN_INVALID" });
    expect(await itemState(cafe, itemId)).toBe("accepted");
  });

  it("a deactivated manager cannot approve", async () => {
    const { cafe, waiter, itemId } = await setup();
    await cafe.deactivateStaff("abebe");
    expect(await voidVia(waiter, voidMessage(itemId))).toEqual({ ok: false, error: "MANAGER_PIN_INVALID" });
  });

  it("a waiter without a manager PIN gets MANAGER_APPROVAL_REQUIRED", async () => {
    const { cafe, waiter, itemId } = await setup();
    expect(await voidVia(waiter, voidMessage(itemId, {}))).toEqual({ ok: false, error: "MANAGER_APPROVAL_REQUIRED" });
    expect(await itemState(cafe, itemId)).toBe("accepted");
  });

  it.each([
    ["approvedBy sent by the tablet", { approvedBy: "abebe" }],
    ["a 4-digit manager PIN", { managerId: "abebe", managerPin: "1234" }],
    ["a PIN without a manager id", { managerPin: MANAGER_PIN }],
    ["a manager id without a PIN", { managerId: "abebe" }],
  ])("%s is an invalid message", async (_label, approval) => {
    const { waiter, itemId } = await setup();
    await waiter.drain(); // discard the pushes from setup (this waiter's own ticket events)
    waiter.send(voidMessage(itemId, approval));
    expect(await waiter.next()).toEqual({ type: "error", error: "INVALID_MESSAGE" });
  });

  it("a retry with the right PIN after a wrong one works with the same key", async () => {
    const { waiter, itemId } = await setup();
    const key = uid("key");
    expect(await voidVia(waiter, voidMessage(itemId, { managerId: "abebe", managerPin: "000000" }, key))).toMatchObject({ ok: false });
    expect(await voidVia(waiter, voidMessage(itemId, undefined, key))).toMatchObject({ ok: true });
  });
});

// ---------- lockout (shared with sign-in, D-58) ----------
describe("manager PIN lockout", () => {
  it("5 wrong manager PINs on voids lock the manager, also for signing in", async () => {
    const { cafe, waiter, itemId } = await setup();
    for (let i = 0; i < 4; i++) {
      expect(await voidVia(waiter, voidMessage(itemId, { managerId: "abebe", managerPin: "000000" }))).toEqual({
        ok: false,
        error: "MANAGER_PIN_INVALID",
      });
    }
    expect(await voidVia(waiter, voidMessage(itemId, { managerId: "abebe", managerPin: "000000" }))).toMatchObject({
      ok: false,
      error: "MANAGER_LOCKED",
    });
    // Even the right PIN is refused now, on voids and on sign-in.
    expect(await voidVia(waiter, voidMessage(itemId))).toMatchObject({ ok: false, error: "MANAGER_LOCKED" });
    const tablet = await cafe.createDevice({ venueId: VENUE, id: "dev-x", name: "x", kind: "waiter", stationId: null });
    expect(tablet.ok).toBe(true);
    const paired = await cafe.completePairing("dev-x");
    if (!paired.ok) throw new Error(paired.error);
    expect(await cafe.signIn({ deviceToken: paired.token, userId: "abebe", pin: MANAGER_PIN })).toMatchObject({ ok: false, error: "LOCKED" });
  });

  it("parallel wrong attempts are all counted", async () => {
    const { waiter, itemId } = await setup();
    for (let i = 0; i < 5; i++) waiter.send(voidMessage(itemId, { managerId: "abebe", managerPin: "000000" }));
    for (let i = 0; i < 5; i++) await waiter.ack();
    expect(await voidVia(waiter, voidMessage(itemId))).toMatchObject({ ok: false, error: "MANAGER_LOCKED" });
  });
});

// ---------- signed-in managers (D-57) ----------
describe("a manager signed in on the tablet", () => {
  it("can void without typing a PIN; the manager is recorded as approver", async () => {
    const { cafe, waiter, itemId } = await setup("abebe", "manager");

    expect(await voidVia(waiter, voidMessage(itemId, {}))).toMatchObject({ ok: true, item: { state: "voided" } });

    const [event] = await sql<{ details: string }>(cafe, "SELECT details FROM order_events WHERE type = 'item.voided'");
    expect(JSON.parse(event!.details)).toMatchObject({ approvedBy: "abebe" });
  });
});
