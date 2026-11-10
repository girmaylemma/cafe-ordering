import { describe, expect, it } from "vitest";
import type { ServerMessage } from "../src/cafe/protocol";
import {
  connect,
  liveHeaders,
  newCafe,
  seedMenu,
  seedTables,
  sql,
  staffHeaders,
  stationHeaders,
  type Cafe,
} from "./helpers";

// ---------- helpers ----------
let counter = 0;
const uid = (prefix: string) => `${prefix}-${++counter}`;

async function setup() {
  const cafe = newCafe();
  await seedMenu(cafe);
  await seedTables(cafe);
  return cafe;
}

type Tablet = Awaited<ReturnType<typeof connect>>;

/** Open a table and return the session id (fails the test if refused). */
async function openTable(waiter: Tablet, tableId = "table-7") {
  const sessionId = uid("session");
  waiter.send({ type: "session.open", idempotencyKey: uid("key"), sessionId, tableId, guests: 2 });
  const ack = await waiter.ack();
  expect(ack.result).toMatchObject({ ok: true });
  return sessionId;
}

function orderMessage(sessionId: string, items: Array<{ menuItemId: string; qty?: number; note?: string | null }>, extra: Record<string, unknown> = {}) {
  return {
    type: "order.send",
    orderId: uid("order"),
    sessionId,
    tableId: "table-7",
    createdAt: Date.now(),
    queuedOffline: false,
    items: items.map((i) => ({ id: uid("oi"), menuItemId: i.menuItemId, qty: i.qty ?? 1, note: i.note ?? null })),
    ...extra,
  };
}

const events = (messages: ServerMessage[]) =>
  messages.flatMap((m) => (m.type === "event" ? [m.event] : []));

async function count(cafe: Cafe, table: string) {
  return (await sql<{ n: number }>(cafe, `SELECT COUNT(*) AS n FROM ${table}`))[0]?.n;
}

// ---------- happy path ----------
describe("sessions and orders", () => {
  it("open a table and send a round: server prices in the ack, a ticket to each item's station", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const bar = await connect(cafe, stationHeaders("bar"));
    const sessionId = await openTable(hana);

    const order = orderMessage(sessionId, [{ menuItemId: "menu-shiro", qty: 2, note: "no onion" }, { menuItemId: "menu-macchiato" }]);
    hana.send(order);

    expect(await hana.ack()).toMatchObject({
      idempotencyKey: order.orderId,
      result: {
        ok: true,
        orderId: order.orderId,
        sessionId,
        round: 1,
        conflict: null,
        items: [
          { name: "Shiro", priceSantim: 18000, qty: 2, note: "no onion", stationId: "kitchen", flag: null },
          { name: "Macchiato", priceSantim: 4000, qty: 1, stationId: "bar", flag: null },
        ],
      },
    });
    const kitchenTickets = events(await kitchen.drain());
    expect(kitchenTickets).toHaveLength(1);
    expect(kitchenTickets[0]).toMatchObject({
      type: "item.sent",
      from: null,
      to: "sent",
      stationId: "kitchen",
      details: { tableId: "table-7", tableName: "Table 7", waiterId: "hana", round: 1, name: "Shiro", qty: 2, note: "no onion", flag: null, conflict: null },
    });
    expect(events(await bar.drain())).toMatchObject([{ type: "item.sent", details: { name: "Macchiato" } }]);
  });

  it("the second round on the same table is round 2", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const sessionId = await openTable(hana);

    hana.send(orderMessage(sessionId, [{ menuItemId: "menu-shiro" }]));
    await hana.ack();
    hana.send(orderMessage(sessionId, [{ menuItemId: "menu-macchiato" }]));

    expect(await hana.ack()).toMatchObject({ result: { ok: true, round: 2 } });
  });

  // ---------- prices ----------
  it("ignores any price from the tablet and copies the menu price", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const sessionId = await openTable(hana);
    const order = orderMessage(sessionId, [{ menuItemId: "menu-shiro" }]);
    (order.items[0] as Record<string, unknown>).priceSantim = 1;

    hana.send(order);
    await hana.ack();

    expect(await sql(cafe, "SELECT name, price_santim FROM order_items")).toEqual([{ name: "Shiro", price_santim: 18000 }]);
  });

  it("a later menu price change does not change an order already sent", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const sessionId = await openTable(hana);
    hana.send(orderMessage(sessionId, [{ menuItemId: "menu-shiro" }]));
    await hana.ack();

    await sql(cafe, "UPDATE menu_items SET price_santim = 25000, name = 'Shiro (new)' WHERE id = 'menu-shiro'");

    expect(await sql(cafe, "SELECT name, price_santim FROM order_items")).toEqual([{ name: "Shiro", price_santim: 18000 }]);
  });

  // ---------- waiter alerts ----------
  it("Kitchen accept alerts the table's waiter, not other waiters", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const sessionId = await openTable(hana);
    hana.send(orderMessage(sessionId, [{ menuItemId: "menu-shiro" }]));
    const sent = await hana.ack();
    if (sent.result.ok !== true || !("items" in sent.result)) throw new Error("order refused");
    await hana.drain();

    kitchen.send({ type: "item.command", idempotencyKey: uid("key"), itemId: sent.result.items[0]!.id, command: { type: "accept" } });
    await kitchen.ack();

    expect(events(await hana.drain())).toMatchObject([{ type: "item.accepted", itemId: sent.result.items[0]!.id }]);
    expect(events(await meron.drain())).toEqual([]);
  });

  // ---------- offline ----------
  it("stores a queued round as sent while offline, with the device time kept for information", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const sessionId = await openTable(hana);
    const before = Date.now();
    const deviceTime = before - 15 * 60_000; // taken 15 minutes ago

    hana.send(orderMessage(sessionId, [{ menuItemId: "menu-shiro" }], { createdAt: deviceTime, queuedOffline: true }));
    await hana.ack();

    const [row] = await sql<{ created_at: number; received_at: number; sent_while_offline: number }>(
      cafe,
      "SELECT created_at, received_at, sent_while_offline FROM orders",
    );
    expect(row).toMatchObject({ created_at: deviceTime, sent_while_offline: 1 });
    expect(row!.received_at).toBeGreaterThanOrEqual(before);
  });

  it("sold-out and removed items are kept and flagged, never dropped (D-17)", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const sessionId = await openTable(hana);

    hana.send(orderMessage(sessionId, [{ menuItemId: "menu-tibs" }, { menuItemId: "menu-old" }]));

    expect(await hana.ack()).toMatchObject({
      result: { ok: true, items: [{ name: "Tibs", flag: "sold_out" }, { name: "Old dish", flag: "unavailable" }] },
    });
    expect(events(await kitchen.drain()).map((e) => e.details?.flag)).toEqual(["sold_out", "unavailable"]);
  });

  // ---------- idempotency ----------
  it("the same round sent twice creates one order and one set of tickets", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const sessionId = await openTable(hana);
    const order = orderMessage(sessionId, [{ menuItemId: "menu-shiro" }]);

    hana.send(order);
    const first = await hana.ack();
    hana.send(order);
    const second = await hana.ack();

    expect(second).toEqual(first);
    expect(await count(cafe, "orders")).toBe(1);
    expect(events(await kitchen.drain())).toHaveLength(1);
  });

  // ---------- refused rounds ----------
  it("an unknown menu item refuses the whole round and writes nothing", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const sessionId = await openTable(hana);

    hana.send(orderMessage(sessionId, [{ menuItemId: "menu-shiro" }, { menuItemId: "menu-pizza" }]));

    expect(await hana.ack()).toMatchObject({ result: { ok: false, error: "UNKNOWN_MENU_ITEM" } });
    expect(await count(cafe, "orders")).toBe(0);
    expect(await count(cafe, "order_items")).toBe(0);
  });

  it("a live round to another waiter's table is refused with NOT_YOUR_TABLE", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));
    const sessionId = await openTable(hana);

    meron.send(orderMessage(sessionId, [{ menuItemId: "menu-shiro" }]));

    expect(await meron.ack()).toMatchObject({ result: { ok: false, error: "NOT_YOUR_TABLE" } });
    expect(await count(cafe, "orders")).toBe(0);
  });

  // ---------- offline conflicts: never refuse a queued round ----------
  it("a queued round for a table someone else opened is attached to their session, credited to the sender, and flagged", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const hanaSession = await openTable(hana);

    // Meron opened Table 7 while offline; her session.open was refused, but her queued round must not be lost.
    const meronOfflineSession = uid("session");
    meron.send(orderMessage(meronOfflineSession, [{ menuItemId: "menu-shiro" }], { queuedOffline: true }));

    expect(await meron.ack()).toMatchObject({ result: { ok: true, sessionId: hanaSession, conflict: "table_taken" } });
    expect(await sql(cafe, "SELECT waiter_id, session_id, conflict FROM orders")).toEqual([
      { waiter_id: "meron", session_id: hanaSession, conflict: "table_taken" },
    ]);
    // Hana holds the table, so she sees the new items; the kitchen sees the conflict on the ticket.
    expect(events(await hana.drain())).toMatchObject([{ type: "item.sent", details: { waiterId: "meron", conflict: "table_taken" } }]);
    expect(events(await kitchen.drain())).toMatchObject([{ details: { conflict: "table_taken" } }]);
  });

  it("a queued round for a session that was closed meanwhile opens a new session and is flagged", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const sessionId = await openTable(hana);
    hana.send({ type: "session.close", idempotencyKey: uid("key"), sessionId });
    expect((await hana.ack()).result).toMatchObject({ ok: true });

    hana.send(orderMessage(sessionId, [{ menuItemId: "menu-shiro" }], { queuedOffline: true }));

    const ack = await hana.ack();
    expect(ack.result).toMatchObject({ ok: true, conflict: "session_closed", round: 1 });
    expect((ack.result as { sessionId: string }).sessionId).not.toBe(sessionId);
    expect(await sql(cafe, "SELECT status FROM table_sessions ORDER BY rowid")).toEqual([{ status: "closed" }, { status: "open" }]);
  });

  // ---------- open and close ----------
  it("opening a table someone else holds is refused and returns their session id", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));
    const hanaSession = await openTable(hana);

    meron.send({ type: "session.open", idempotencyKey: uid("key"), sessionId: uid("session"), tableId: "table-7", guests: null });

    expect(await meron.ack()).toMatchObject({
      result: { ok: false, error: "TABLE_ALREADY_OPEN", existingSessionId: hanaSession },
    });
  });

  it("opening a table that does not exist is refused", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));

    hana.send({ type: "session.open", idempotencyKey: uid("key"), sessionId: uid("session"), tableId: "table-99", guests: null });

    expect(await hana.ack()).toMatchObject({ result: { ok: false, error: "TABLE_NOT_FOUND" } });
  });

  it("closing is refused until every item is delivered, cancelled or voided; then the table can be reopened", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const sessionId = await openTable(hana);
    hana.send(orderMessage(sessionId, [{ menuItemId: "menu-shiro" }]));
    const sent = await hana.ack();
    if (sent.result.ok !== true || !("items" in sent.result)) throw new Error("order refused");
    const itemId = sent.result.items[0]!.id;
    const close = () => hana.send({ type: "session.close", idempotencyKey: uid("key"), sessionId });

    close();
    expect(await hana.ack()).toMatchObject({ result: { ok: false, error: "ITEMS_NOT_FINISHED" } });

    for (const type of ["accept", "ready"]) {
      kitchen.send({ type: "item.command", idempotencyKey: uid("key"), itemId, command: { type } });
      await kitchen.ack();
    }
    hana.send({ type: "item.command", idempotencyKey: uid("key"), itemId, command: { type: "delivered" } });
    await hana.ack();

    close();
    expect(await hana.ack()).toMatchObject({ result: { ok: true, alreadyDone: false } });
    await openTable(hana); // free again
  });

  it("only the table's waiter can close it", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));
    const sessionId = await openTable(hana);

    meron.send({ type: "session.close", idempotencyKey: uid("key"), sessionId });

    expect(await meron.ack()).toMatchObject({ result: { ok: false, error: "NOT_YOUR_TABLE" } });
  });

  it("opening and closing are written to the audit log", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const sessionId = await openTable(hana);
    hana.send({ type: "session.close", idempotencyKey: uid("key"), sessionId });
    await hana.ack();

    // (The log also holds the waiter's auth.signed_in event, tested in auth.test.ts.)
    expect(await sql(cafe, "SELECT type, session_id FROM order_events WHERE type LIKE 'session.%' ORDER BY seq")).toEqual([
      { type: "session.opened", session_id: sessionId },
      { type: "session.closed", session_id: sessionId },
    ]);
  });

  // ---------- catch-up ----------
  it("a waiter's sync returns only events for the tables they currently hold", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const meron = await connect(cafe, staffHeaders("meron"));
    const hanaSession = await openTable(hana, "table-7");
    const meronSession = await openTable(meron, "table-8");
    hana.send(orderMessage(hanaSession, [{ menuItemId: "menu-shiro" }]));
    await hana.ack();
    meron.send(orderMessage(meronSession, [{ menuItemId: "menu-macchiato" }], { tableId: "table-8" }));
    await meron.ack();

    const reconnected = await connect(cafe, staffHeaders("hana"));
    reconnected.send({ type: "sync", since: 0 });
    const result = await reconnected.next();

    expect(result).toMatchObject({ type: "sync.result", events: [{ type: "item.sent", details: { name: "Shiro" } }] });
    if (result.type === "sync.result") expect(result.events).toHaveLength(1);
  });

  it("a kitchen tablet that reconnects catches up on tickets it missed", async () => {
    const cafe = await setup();
    const hana = await connect(cafe, staffHeaders("hana"));
    const sessionId = await openTable(hana);
    hana.send(orderMessage(sessionId, [{ menuItemId: "menu-shiro" }]));
    await hana.ack();

    const kitchen = await connect(cafe, stationHeaders("kitchen")); // was offline during the send
    kitchen.send({ type: "sync", since: 0 });

    expect(await kitchen.next()).toMatchObject({
      type: "sync.result",
      events: [{ type: "item.sent", details: { name: "Shiro", tableName: "Table 7" } }],
    });
  });

  // ---------- who may send what ----------
  it("kitchen tablets and the live view cannot open tables or send rounds", async () => {
    const cafe = await setup();
    const kitchen = await connect(cafe, stationHeaders("kitchen"));
    const live = await connect(cafe, liveHeaders);

    kitchen.send(orderMessage("s-x", [{ menuItemId: "menu-shiro" }]));
    expect(await kitchen.next()).toEqual({ type: "error", error: "NOT_ALLOWED_FOR_CONNECTION" });
    live.send({ type: "session.open", idempotencyKey: uid("key"), sessionId: uid("session"), tableId: "table-7", guests: null });
    expect(await live.next()).toEqual({ type: "error", error: "NOT_ALLOWED_FOR_CONNECTION" });
  });
});
