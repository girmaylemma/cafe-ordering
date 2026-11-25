/**
 * D-78: a manager or owner signed in on a tablet may act on ANY table. The server allowed the
 * commands, but a manager's tablet only received its own tables' lines, so it could never show
 * (or act on) another waiter's table. A manager's tablet now gets every open table's lines: in
 * the /lines download, in live pushes and in catch-up. Waiters still get only their own.
 */
import { describe, expect, it } from "vitest";
import { connect, ensureStaff, newCafe, seedMenu, seedTables, signedInWaiter, staffHeaders, stationHeaders } from "./helpers";

let counter = 0;
const key = () => `manager-key-${++counter}`;

type Tablet = Awaited<ReturnType<typeof connect>>;

async function setup() {
  const cafe = newCafe();
  await seedMenu(cafe);
  await seedTables(cafe);
  const hana = await connect(cafe, staffHeaders("hana"));
  const kitchen = await connect(cafe, stationHeaders("kitchen"));
  hana.send({ type: "session.open", idempotencyKey: key(), sessionId: "s1", tableId: "table-7", guests: 2 });
  expect((await hana.ack()).result).toMatchObject({ ok: true });
  hana.send({
    type: "order.send",
    orderId: "o1",
    sessionId: "s1",
    tableId: "table-7",
    createdAt: Date.now(),
    queuedOffline: false,
    items: [{ id: "i1", menuItemId: "menu-shiro", qty: 1, note: null }],
  });
  expect((await hana.ack()).result).toMatchObject({ ok: true });
  return { cafe, hana, kitchen };
}

async function accept(kitchen: Tablet, itemId: string) {
  kitchen.send({ type: "item.command", idempotencyKey: key(), itemId, command: { type: "accept" } });
  expect((await kitchen.ack()).result).toMatchObject({ ok: true });
}

const itemEvents = (messages: Array<{ type: string }>) =>
  messages.filter((m): m is { type: "event"; event: { itemId: string; type: string } } & { type: string } => m.type === "event").map((m) => m.event);

describe("a manager's tablet sees every open table (D-78)", () => {
  it("GET /lines gives a manager the lines of another waiter's table", async () => {
    const { cafe } = await setup();
    const meron = await signedInWaiter(cafe, "meron", "manager");

    const result = await cafe.tabletLines(meron.token, meron.sessionToken);

    expect(result.ok && result.lines.map((l) => l.itemId)).toEqual(["i1"]);
  });

  it("GET /lines still gives a waiter only their own tables", async () => {
    const { cafe } = await setup();
    const abel = await signedInWaiter(cafe, "abel");

    const result = await cafe.tabletLines(abel.token, abel.sessionToken);

    expect(result.ok && result.lines).toEqual([]);
  });

  it("live: a change on Hana's table reaches a manager's tablet, not another waiter's", async () => {
    const { cafe, kitchen } = await setup();
    const meron = await connect(cafe, staffHeaders("meron", "manager"));
    const abel = await connect(cafe, staffHeaders("abel"));

    await accept(kitchen, "i1");

    expect(itemEvents(await meron.drain())).toEqual([expect.objectContaining({ itemId: "i1", type: "item.accepted" })]);
    expect(itemEvents(await abel.drain())).toEqual([]);
  });

  it("live: a manager who holds the table gets each change once, not twice", async () => {
    const cafe = newCafe();
    await seedMenu(cafe);
    await seedTables(cafe);
    const meron = await connect(cafe, staffHeaders("meron", "manager"));
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    meron.send({ type: "session.open", idempotencyKey: key(), sessionId: "s9", tableId: "table-8", guests: 1 });
    expect((await meron.ack()).result).toMatchObject({ ok: true });
    meron.send({
      type: "order.send",
      orderId: "o9",
      sessionId: "s9",
      tableId: "table-8",
      createdAt: Date.now(),
      queuedOffline: false,
      items: [{ id: "i9", menuItemId: "menu-shiro", qty: 1, note: null }],
    });
    expect((await meron.ack()).result).toMatchObject({ ok: true });
    await meron.drain();

    await accept(kitchen, "i9");

    expect(itemEvents(await meron.drain()).filter((e) => e.type === "item.accepted")).toHaveLength(1);
  });

  it("catch-up: a manager's tablet replays another waiter's table, a waiter's does not", async () => {
    const { cafe, kitchen } = await setup();
    await accept(kitchen, "i1");
    await ensureStaff(cafe, "abel");
    const meron = await connect(cafe, staffHeaders("meron", "manager"));
    const abel = await connect(cafe, staffHeaders("abel"));

    meron.send({ type: "sync", since: 0 });
    abel.send({ type: "sync", since: 0 });
    const forMeron = await meron.next();
    const forAbel = await abel.next();

    expect(forMeron.type === "sync.result" && forMeron.events.map((e) => [e.itemId, e.type])).toEqual([
      ["i1", "item.sent"],
      ["i1", "item.accepted"],
    ]);
    expect(forAbel.type === "sync.result" && forAbel.events).toEqual([]);
  });
});
