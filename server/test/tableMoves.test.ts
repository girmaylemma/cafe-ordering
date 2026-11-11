/** Move, merge and hand over tables (W-09, 3c), plus the manager override (D-46, D-78). */
import { describe, expect, it } from "vitest";
import type { ServerMessage, WireEvent } from "../src/cafe/protocol";
import { connect, ensureStaff, newCafe, seedMenu, seedTables, sql, staffHeaders, stationHeaders, type Cafe } from "./helpers";

let counter = 0;
const key = () => `key-${++counter}`;
type Tablet = Awaited<ReturnType<typeof connect>>;

async function setup() {
  const cafe = newCafe();
  await seedMenu(cafe);
  await seedTables(cafe);
  await sql(cafe, "INSERT INTO tables (id, venue_id, name, active) VALUES ('table-9', 'venue-abebe', 'Table 9', 1)");
  return cafe;
}

async function ack(tablet: Tablet, message: unknown) {
  tablet.send(message);
  return (await tablet.ack()).result as Record<string, unknown>;
}

const open = (tablet: Tablet, sessionId: string, tableId: string) =>
  ack(tablet, { type: "session.open", idempotencyKey: key(), sessionId, tableId, guests: 2 });

const round = (tablet: Tablet, sessionId: string, tableId: string, items: Array<[string, string]>) =>
  ack(tablet, {
    type: "order.send",
    orderId: `o-${++counter}`,
    sessionId,
    tableId,
    createdAt: Date.now(),
    queuedOffline: false,
    items: items.map(([id, menuItemId]) => ({ id, menuItemId, qty: 1, note: null })),
  });

const itemCommand = (tablet: Tablet, itemId: string, type: string) => ack(tablet, { type: "item.command", idempotencyKey: key(), itemId, command: { type } });

const events = (messages: ServerMessage[], type: string): WireEvent[] =>
  messages.flatMap((m) => (m.type === "event" && m.event.type === type ? [m.event] : []));
const tableStates = (messages: ServerMessage[]) =>
  messages.flatMap((m) => (m.type === "table.state" ? [[m.tableId, m.state, m.waiterId]] : []));

// ---------- move ----------
describe("move a table visit", () => {
  async function seated(cafe: Cafe) {
    const hana = await connect(cafe, staffHeaders("hana"));
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const meron = await connect(cafe, staffHeaders("meron"));
    await open(hana, "s7", "table-7");
    await round(hana, "s7", "table-7", [["i1", "menu-shiro"], ["i2", "menu-tibs"]]);
    await itemCommand(kitchen, "i1", "accept");
    await itemCommand(kitchen, "i1", "ready");
    await itemCommand(hana, "i1", "delivered"); // i1 done; i2 still waiting
    for (const t of [hana, kitchen, meron]) await t.drain();
    return { hana, kitchen, meron };
  }

  it("moves everything to a free table; floor maps update; the kitchen learns the new table for unfinished items", async () => {
    const cafe = await setup();
    const { hana, kitchen, meron } = await seated(cafe);

    expect(await ack(hana, { type: "session.move", idempotencyKey: key(), sessionId: "s7", toTableId: "table-9" })).toMatchObject({ ok: true, tableId: "table-9" });

    expect(await sql(cafe, "SELECT table_id FROM table_sessions WHERE id = 's7'")).toEqual([{ table_id: "table-9" }]);
    expect(tableStates(await meron.drain())).toEqual([
      ["table-7", "free", null],
      ["table-9", "ordered", "hana"],
    ]);
    const moved = events(await kitchen.drain(), "item.table_changed");
    expect(moved.map((e) => [e.itemId, e.details?.tableName])).toEqual([["i2", "Table 9"]]); // delivered i1 is not re-announced
  });

  it("a kitchen tablet that was offline catches up on the move", async () => {
    const cafe = await setup();
    const { hana } = await seated(cafe);
    await ack(hana, { type: "session.move", idempotencyKey: key(), sessionId: "s7", toTableId: "table-9" });

    const late = await connect(cafe, stationHeaders("kitchen"));
    late.send({ type: "sync", since: 0 });
    const result = await late.next();

    if (result.type !== "sync.result") throw new Error("expected sync.result");
    expect(result.events.filter((e) => e.type === "item.table_changed").map((e) => e.details?.tableName)).toEqual(["Table 9"]);
  });

  it("refuses a table that is taken or doesn't exist", async () => {
    const cafe = await setup();
    const { hana, meron } = await seated(cafe);
    await open(meron, "s8", "table-8");
    expect(await ack(hana, { type: "session.move", idempotencyKey: key(), sessionId: "s7", toTableId: "table-8" })).toMatchObject({ ok: false, error: "TABLE_ALREADY_OPEN" });
    expect(await ack(hana, { type: "session.move", idempotencyKey: key(), sessionId: "s7", toTableId: "table-99" })).toMatchObject({ ok: false, error: "TABLE_NOT_FOUND" });
  });

  it("another waiter can't move it; a manager can", async () => {
    const cafe = await setup();
    const { meron } = await seated(cafe);
    expect(await ack(meron, { type: "session.move", idempotencyKey: key(), sessionId: "s7", toTableId: "table-9" })).toMatchObject({ ok: false, error: "NOT_YOUR_TABLE" });

    await ensureStaff(cafe, "abebe", "manager");
    const manager = await connect(cafe, staffHeaders("abebe", "manager"));
    expect(await ack(manager, { type: "session.move", idempotencyKey: key(), sessionId: "s7", toTableId: "table-9" })).toMatchObject({ ok: true });
  });

  it("kitchen tablets can't move tables", async () => {
    const cafe = await setup();
    const { kitchen } = await seated(cafe);
    kitchen.send({ type: "session.move", idempotencyKey: key(), sessionId: "s7", toTableId: "table-9" });
    expect(await kitchen.next()).toEqual({ type: "error", error: "NOT_ALLOWED_FOR_CONNECTION" });
  });
});

// ---------- merge ----------
describe("merge two tables", () => {
  it("moves the rounds into the target visit, frees the other table, renumbers rounds and keeps sales credit", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));
    await open(hana, "s7", "table-7");
    await open(hana, "s8", "table-8");
    await round(hana, "s7", "table-7", [["a1", "menu-shiro"]]);
    await round(hana, "s8", "table-8", [["b1", "menu-macchiato"]]);
    await meron.drain();

    expect(await ack(hana, { type: "session.merge", idempotencyKey: key(), sessionId: "s8", intoSessionId: "s7" })).toMatchObject({ ok: true, sessionId: "s7", tableId: "table-7" });

    expect(await sql(cafe, "SELECT session_id, round, waiter_id FROM orders ORDER BY round")).toEqual([
      { session_id: "s7", round: 1, waiter_id: "hana" },
      { session_id: "s7", round: 2, waiter_id: "hana" },
    ]);
    expect(await sql(cafe, "SELECT id, status FROM table_sessions ORDER BY id")).toEqual([
      { id: "s7", status: "open" },
      { id: "s8", status: "closed" },
    ]);
    expect(tableStates(await meron.drain())).toEqual([["table-8", "free", null]]); // table 7 was already "ordered"
    const types = await sql<{ type: string }>(cafe, "SELECT type FROM order_events WHERE type LIKE 'session.%' ORDER BY seq");
    expect(types.map((t) => t.type)).toContain("session.merged");
  });

  it("merging a colleague's table needs both tables or a manager; the target's waiter keeps it", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));
    await open(hana, "s7", "table-7");
    await open(meron, "s8", "table-8");
    await round(meron, "s8", "table-8", [["b1", "menu-macchiato"]]);

    expect(await ack(hana, { type: "session.merge", idempotencyKey: key(), sessionId: "s8", intoSessionId: "s7" })).toMatchObject({ ok: false, error: "NOT_YOUR_TABLE" });

    await ensureStaff(cafe, "abebe", "manager");
    const manager = await connect(cafe, staffHeaders("abebe", "manager"));
    expect(await ack(manager, { type: "session.merge", idempotencyKey: key(), sessionId: "s8", intoSessionId: "s7" })).toMatchObject({ ok: true });
    expect(await sql(cafe, "SELECT waiter_id FROM table_sessions WHERE id = 's7'")).toEqual([{ waiter_id: "hana" }]);
    expect(await sql(cafe, "SELECT waiter_id FROM orders")).toEqual([{ waiter_id: "meron" }]); // credit unchanged
  });

  it("refuses merging a visit into itself", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    await open(hana, "s7", "table-7");
    expect(await ack(hana, { type: "session.merge", idempotencyKey: key(), sessionId: "s7", intoSessionId: "s7" })).toMatchObject({ ok: false, error: "SAME_SESSION" });
  });
});

// ---------- hand over ----------
describe("hand over a table", () => {
  it("takes effect at once: the receiver is told, and later Ready alerts go to them; sales stay with the original waiter", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    await open(hana, "s7", "table-7");
    await round(hana, "s7", "table-7", [["i1", "menu-shiro"]]);
    await itemCommand(kitchen, "i1", "accept");
    await meron.drain();

    expect(await ack(hana, { type: "session.transfer", idempotencyKey: key(), sessionId: "s7", toWaiterId: "meron" })).toMatchObject({ ok: true });

    const meronGot = await meron.drain();
    expect(meronGot.filter((m) => m.type === "table.transferred")).toEqual([
      { type: "table.transferred", tableId: "table-7", sessionId: "s7", fromWaiterId: "hana" },
    ]);
    await hana.drain();
    await itemCommand(kitchen, "i1", "ready");
    expect(events(await meron.drain(), "item.ready")).toHaveLength(1);
    expect(events(await hana.drain(), "item.ready")).toHaveLength(0);
    expect(await sql(cafe, "SELECT waiter_id FROM orders")).toEqual([{ waiter_id: "hana" }]);
  });

  it("refuses an unknown or deactivated receiver", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    await open(hana, "s7", "table-7");
    await ensureStaff(cafe, "dawit");
    await cafe.deactivateStaff("dawit");
    for (const toWaiterId of ["nobody", "dawit"]) {
      expect(await ack(hana, { type: "session.transfer", idempotencyKey: key(), sessionId: "s7", toWaiterId })).toMatchObject({ ok: false, error: "STAFF_NOT_FOUND" });
    }
  });

  it("only the holder or a manager can hand it over", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));
    await open(hana, "s7", "table-7");
    expect(await ack(meron, { type: "session.transfer", idempotencyKey: key(), sessionId: "s7", toWaiterId: "meron" })).toMatchObject({ ok: false, error: "NOT_YOUR_TABLE" });

    await ensureStaff(cafe, "abebe", "manager");
    const manager = await connect(cafe, staffHeaders("abebe", "manager"));
    expect(await ack(manager, { type: "session.transfer", idempotencyKey: key(), sessionId: "s7", toWaiterId: "meron" })).toMatchObject({ ok: true });
    expect(await sql(cafe, "SELECT waiter_id FROM table_sessions WHERE id = 's7'")).toEqual([{ waiter_id: "meron" }]);
  });
});

// ---------- manager override (D-78) ----------
describe("a manager can act on any table", () => {
  it("sends a round to a waiter's table (credited to the manager) and closes it", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    await open(hana, "s7", "table-7");
    await ensureStaff(cafe, "abebe", "manager");
    const manager = await connect(cafe, staffHeaders("abebe", "manager"));

    expect(await round(manager, "s7", "table-7", [["m1", "menu-shiro"]])).toMatchObject({ ok: true, conflict: null });
    expect(await sql(cafe, "SELECT waiter_id FROM orders")).toEqual([{ waiter_id: "abebe" }]);

    await sql(cafe, "UPDATE order_items SET state = 'cancelled'");
    expect(await ack(manager, { type: "session.close", idempotencyKey: key(), sessionId: "s7" })).toMatchObject({ ok: true });
  });
});
