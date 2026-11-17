/**
 * GET /tickets: a kitchen or bar tablet's open rounds, for when catch-up is too long to replay
 * (more than MAX_CATCH_UP_EVENTS missed; the bug this fixes: such a tablet showed nothing).
 */
import { describe, expect, it } from "vitest";
import { admin, call, json, newCafe as newAdminCafe } from "./adminHelpers";
import { connect, newCafe, pairDevice, seedMenu, seedTables, sql, staffHeaders, stationHeaders } from "./helpers";

let counter = 0;
const details = (ticket: { details: string }) => JSON.parse(ticket.details) as Record<string, unknown>;

/** A kitchen tablet paired through the real routes (dashboard code, then POST /devices/pair). */
async function stationToken(email: string) {
  const created = await json<{ pairingCode: { code: string } }>(
    await admin("POST", "/admin/api/devices", email, { name: "Kitchen", kind: "station", stationId: "kitchen" }),
  );
  const paired = await call("POST", "/devices/pair", {
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.30.${counter % 250}.${Math.floor(Math.random() * 250)}` },
    body: { code: created.pairingCode.code },
  });
  return (await json<{ token: string }>(paired)).token;
}
const key = () => `key-${++counter}`;

async function setup() {
  const cafe = newCafe();
  await seedMenu(cafe);
  await seedTables(cafe);
  const hana = await connect(cafe, staffHeaders("hana"));
  const kitchen = await connect(cafe, stationHeaders("kitchen")); // to tap accept / ready
  const station = await pairDevice(cafe, "station", "kitchen"); // the tablet that downloads
  hana.send({ type: "session.open", idempotencyKey: key(), sessionId: "s1", tableId: "table-7", guests: 2 });
  await hana.ack();
  return { cafe, hana, kitchen, station };
}

type Tablet = Awaited<ReturnType<typeof connect>>;

async function round(hana: Tablet, orderId: string, items: Array<[string, string]>) {
  hana.send({
    type: "order.send",
    orderId,
    sessionId: "s1",
    tableId: "table-7",
    createdAt: Date.now(),
    queuedOffline: false,
    items: items.map(([id, menuItemId]) => ({ id, menuItemId, qty: 1, note: null })),
  });
  expect((await hana.ack()).result).toMatchObject({ ok: true });
}

async function tap(tablet: Tablet, itemId: string, type: string, extra: Record<string, unknown> = {}) {
  tablet.send({ type: "item.command", idempotencyKey: key(), itemId, command: { type, ...extra } });
  return (await tablet.ack()).result;
}

describe("GET /tickets (kitchen reload)", () => {
  it("returns this station's open rounds with the full ticket and each item's state now", async () => {
    const { cafe, hana, kitchen, station } = await setup();
    await round(hana, "o1", [["i1", "menu-shiro"], ["i2", "menu-macchiato"]]); // macchiato goes to the bar
    await tap(kitchen, "i1", "accept");

    const result = await cafe.tabletTickets(station.token);

    if (!result.ok) throw new Error(result.error);
    expect(result.tickets[0]).toMatchObject({ itemId: "i1", orderId: "o1", state: "accepted" });
    expect(details(result.tickets[0]!)).toMatchObject({ tableId: "table-7", tableName: "Table 7", waiterName: "Hana", round: 1, name: "Shiro", qty: 1, sentWhileOffline: false });
    expect(result.tickets).toHaveLength(1); // the bar's item is not the kitchen's business
    const [order] = await sql<{ received_at: number }>(cafe, "SELECT received_at FROM orders WHERE id = 'o1'");
    expect(result.tickets[0]!.receivedAt).toBe(order!.received_at);
  });

  it("gives the newest event number, so the tablet continues catch-up from there", async () => {
    const { cafe, hana, station } = await setup();
    await round(hana, "o1", [["i1", "menu-shiro"]]);

    const result = await cafe.tabletTickets(station.token);

    const [last] = await sql<{ seq: number }>(cafe, "SELECT MAX(seq) AS seq FROM order_events");
    expect(result.ok && result.seq).toBe(last!.seq);
  });

  it("a finished round is left out; an open round keeps its cancelled item (shown crossed out)", async () => {
    const { cafe, hana, kitchen, station } = await setup();
    await round(hana, "o1", [["i1", "menu-shiro"]]);
    await tap(kitchen, "i1", "accept");
    await tap(kitchen, "i1", "ready");
    await tap(hana, "i1", "delivered");
    await round(hana, "o2", [["i2", "menu-shiro"], ["i3", "menu-shiro"]]);
    await tap(hana, "i2", "cancel");

    const result = await cafe.tabletTickets(station.token);

    expect(result.ok && result.tickets.map((t) => [t.itemId, t.state])).toEqual([
      ["i2", "cancelled"],
      ["i3", "sent"],
    ]);
  });

  it("shows the table the round is on NOW, after a table move", async () => {
    const { cafe, hana, station } = await setup();
    await round(hana, "o1", [["i1", "menu-shiro"]]);
    hana.send({ type: "session.move", idempotencyKey: key(), sessionId: "s1", toTableId: "table-8" });
    expect((await hana.ack()).result).toMatchObject({ ok: true });

    const result = await cafe.tabletTickets(station.token);

    expect(result.ok && details(result.tickets[0]!)).toMatchObject({ tableId: "table-8", tableName: "Table 8" });
  });

  it("only a kitchen or bar tablet may download tickets", async () => {
    const { cafe } = await setup();
    const waiterTablet = await pairDevice(cafe, "waiter");

    expect(await cafe.tabletTickets(waiterTablet.token)).toEqual({ ok: false, error: "NOT_A_STATION_DEVICE" });
    expect(await cafe.tabletTickets("not-a-token")).toEqual({ ok: false, error: "UNAUTHORIZED_DEVICE" });
  });

  it("the public route refuses a request without a device token", async () => {
    const response = await call("GET", "/tickets");
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "UNAUTHORIZED_DEVICE" });
  });

  it("the public route gives a kitchen tablet its tickets with details as objects", async () => {
    const { ownerEmail } = await newAdminCafe();
    const token = await stationToken(ownerEmail);

    const response = await call("GET", "/tickets", { headers: { Authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ tickets: [], seq: expect.any(Number) });
  });
});
