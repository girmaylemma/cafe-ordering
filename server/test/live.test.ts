/** Sold-out toggle (K-05, W-10) and live table states (W-02) pushed to every waiter (3b, part 1). */
import { describe, expect, it } from "vitest";
import type { ServerMessage } from "../src/cafe/protocol";
import { connect, ensureStaff, newCafe, pairDevice, seedMenu, seedTables, sql, staffHeaders, stationHeaders, type Cafe } from "./helpers";

let counter = 0;
const key = () => `key-${++counter}`;
type Tablet = Awaited<ReturnType<typeof connect>>;

const pushes = (messages: ServerMessage[], type: string) => messages.filter((m) => m.type === type);

async function setup() {
  const cafe = newCafe();
  await seedMenu(cafe);
  await seedTables(cafe);
  return cafe;
}

function soldOut(menuItemId: string, value: boolean) {
  return { type: "menu.sold_out", idempotencyKey: key(), menuItemId, soldOut: value };
}

// ---------- sold out ----------
describe("sold out", () => {
  it("the kitchen marks an item sold out; every waiter and the kitchen's other tablets are told at once", async () => {
    const cafe = await setup();
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const kitchen2 = await connect(cafe, stationHeaders("kitchen"));
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));

    kitchen.send(soldOut("menu-shiro", true));

    expect(await kitchen.ack()).toMatchObject({ result: { ok: true, menuItemId: "menu-shiro", soldOut: true, alreadyDone: false } });
    const expected = { type: "menu.sold_out", menuItemId: "menu-shiro", soldOut: true };
    for (const tablet of [hana, meron, kitchen2]) expect(pushes(await tablet.drain(), "menu.sold_out")).toEqual([expected]);
    expect(await sql(cafe, "SELECT sold_out FROM menu_items WHERE id = 'menu-shiro'")).toEqual([{ sold_out: 1 }]);
  });

  it("is written to the audit log against the station tablet; back in stock works the same way", async () => {
    const cafe = await setup();
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    kitchen.send(soldOut("menu-shiro", true));
    await kitchen.ack();
    kitchen.send(soldOut("menu-shiro", false));
    await kitchen.ack();

    const events = await sql<{ type: string; details: string; actor: string }>(cafe, "SELECT type, details, actor FROM order_events WHERE type = 'menu.sold_out' ORDER BY seq");
    expect(events.map((e) => JSON.parse(e.details))).toEqual([
      { menuItemId: "menu-shiro", soldOut: true },
      { menuItemId: "menu-shiro", soldOut: false },
    ]);
    expect(JSON.parse(events[0]!.actor)).toMatchObject({ kind: "station", stationId: "kitchen" });
  });

  it("repeating the same state is 'already done' and pushes nothing", async () => {
    const cafe = await setup();
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const hana = await connect(cafe, staffHeaders("hana"));
    kitchen.send(soldOut("menu-shiro", true));
    await kitchen.ack();
    await hana.drain();

    kitchen.send(soldOut("menu-shiro", true));

    expect(await kitchen.ack()).toMatchObject({ result: { ok: true, alreadyDone: true } });
    expect(pushes(await hana.drain(), "menu.sold_out")).toEqual([]);
  });

  it("a station can only change its own items; waiters can't change sold-out at all", async () => {
    const cafe = await setup();
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const hana = await connect(cafe, staffHeaders("hana"));

    kitchen.send(soldOut("menu-macchiato", true)); // a bar item
    expect(await kitchen.ack()).toMatchObject({ result: { ok: false, error: "WRONG_STATION" } });

    await hana.drain();
    hana.send(soldOut("menu-shiro", true));
    expect(await hana.next()).toEqual({ type: "error", error: "NOT_ALLOWED_FOR_CONNECTION" });
  });

  it("an unknown or removed menu item is refused", async () => {
    const cafe = await setup();
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    for (const id of ["menu-pizza", "menu-old"]) {
      kitchen.send(soldOut(id, true));
      expect(await kitchen.ack()).toMatchObject({ result: { ok: false, error: "MENU_ITEM_NOT_FOUND" } });
    }
  });

  it("a manager changing sold-out in the dashboard is pushed to waiters too", async () => {
    const cafe = await setup();
    await ensureStaff(cafe, "abebe", "manager");
    const hana = await connect(cafe, staffHeaders("hana"));
    await hana.drain();

    const result = await cafe.adminUpdateMenuItem("abebe", "menu-shiro", { soldOut: true });

    expect(result).toMatchObject({ ok: true, item: { soldOut: true } });
    expect(pushes(await hana.drain(), "menu.sold_out")).toEqual([{ type: "menu.sold_out", menuItemId: "menu-shiro", soldOut: true }]);
  });
});

// ---------- live table states ----------
describe("live table states", () => {
  async function waiterAndKitchen(cafe: Cafe) {
    const hana = await connect(cafe, staffHeaders("hana"));
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const meron = await connect(cafe, staffHeaders("meron")); // another waiter watching the floor map
    return { hana, kitchen, meron };
  }

  const states = async (watcher: Tablet) =>
    pushes(await watcher.drain(), "table.state").map((m) => (m as Extract<ServerMessage, { type: "table.state" }>).state);

  it("every waiter sees a table go seated → ordered → accepted → ready → delivered → free", async () => {
    const cafe = await setup();
    const { hana, kitchen, meron } = await waiterAndKitchen(cafe);

    hana.send({ type: "session.open", idempotencyKey: key(), sessionId: "s1", tableId: "table-7", guests: 2 });
    await hana.ack();
    expect(await states(meron)).toEqual(["seated"]);

    hana.send({
      type: "order.send", orderId: "o1", sessionId: "s1", tableId: "table-7", createdAt: Date.now(), queuedOffline: false,
      items: [{ id: "i1", menuItemId: "menu-shiro", qty: 1, note: null }, { id: "i2", menuItemId: "menu-tibs", qty: 1, note: null }],
    });
    await hana.ack();
    expect(await states(meron)).toEqual(["ordered"]);

    const tap = async (tablet: Tablet, itemId: string, type: string) => {
      tablet.send({ type: "item.command", idempotencyKey: key(), itemId, command: { type } });
      await tablet.ack();
    };
    await tap(kitchen, "i1", "accept");
    expect(await states(meron)).toEqual([]); // i2 still waits for the kitchen: no change, no push
    await tap(kitchen, "i2", "accept");
    expect(await states(meron)).toEqual(["accepted"]);
    await tap(kitchen, "i1", "ready");
    expect(await states(meron)).toEqual(["ready"]); // ready wins: something to pick up
    await tap(hana, "i1", "delivered");
    expect(await states(meron)).toEqual(["accepted"]);
    await tap(kitchen, "i2", "ready");
    await tap(hana, "i2", "delivered");
    expect(await states(meron)).toEqual(["ready", "delivered"]);

    hana.send({ type: "session.close", idempotencyKey: key(), sessionId: "s1" });
    await hana.ack();
    expect(await states(meron)).toEqual(["free"]);
  });

  it("'ready' wins over a new round still waiting for the kitchen: food to pick up is never hidden", async () => {
    const cafe = await setup();
    const { hana, kitchen, meron } = await waiterAndKitchen(cafe);
    hana.send({ type: "session.open", idempotencyKey: key(), sessionId: "s1", tableId: "table-7", guests: 2 });
    await hana.ack();
    const round = (orderId: string, itemId: string) => ({
      type: "order.send", orderId, sessionId: "s1", tableId: "table-7", createdAt: Date.now(), queuedOffline: false,
      items: [{ id: itemId, menuItemId: "menu-shiro", qty: 1, note: null }],
    });
    hana.send(round("o1", "i1"));
    await hana.ack();
    for (const type of ["accept", "ready"]) {
      kitchen.send({ type: "item.command", idempotencyKey: key(), itemId: "i1", command: { type } });
      await kitchen.ack();
    }
    await meron.drain();

    hana.send(round("o2", "i2")); // a second round arrives while i1 waits to be picked up

    await hana.ack();
    expect(await states(meron)).toEqual([]); // still "ready": nothing changes on the floor map
    const tablet = await pairDevice(cafe, "waiter");
    const result = await cafe.tabletTables(tablet.token);
    expect(result.ok && result.tables.find((t) => t.id === "table-7")?.state).toBe("ready");
  });

  it("the push says which table, which session and which waiter holds it", async () => {
    const cafe = await setup();
    const { hana, meron } = await waiterAndKitchen(cafe);
    hana.send({ type: "session.open", idempotencyKey: key(), sessionId: "s1", tableId: "table-7", guests: 2 });
    await hana.ack();

    expect(pushes(await meron.drain(), "table.state")).toEqual([
      { type: "table.state", tableId: "table-7", state: "seated", sessionId: "s1", waiterId: "hana" },
    ]);
  });

  it("GET /tables (the tablet download after a reconnect) shows the same states", async () => {
    const cafe = await setup();
    const { hana } = await waiterAndKitchen(cafe);
    hana.send({ type: "session.open", idempotencyKey: key(), sessionId: "s1", tableId: "table-7", guests: 2 });
    await hana.ack();
    const tablet = await pairDevice(cafe, "waiter");

    const result = await cafe.tabletTables(tablet.token);

    expect(result.ok && result.tables.map((t) => [t.id, t.state, t.waiterId])).toEqual([
      ["table-7", "seated", "hana"],
      ["table-8", "free", null],
    ]);
  });
});
