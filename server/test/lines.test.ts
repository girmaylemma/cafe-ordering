/**
 * GET /lines: a waiter's tablet downloads the lines of the tables that waiter holds, for when
 * catch-up is too long to replay (more than MAX_CATCH_UP_EVENTS missed). The bug this fixes: a
 * waiter's tablet reloaded only menu and tables, so missed rounds and states never arrived.
 */
import { describe, expect, it } from "vitest";
import { admin, call, json, newCafe as newAdminCafe } from "./adminHelpers";
import { connect, ensureStaff, newCafe, pairDevice, seedMenu, seedTables, signedInWaiter, sql, staffHeaders, stationHeaders } from "./helpers";

let counter = 0;
const key = () => `lines-key-${++counter}`;
const details = (line: { details: string }) => JSON.parse(line.details) as Record<string, unknown>;

type Tablet = Awaited<ReturnType<typeof connect>>;

async function setup() {
  const cafe = newCafe();
  await seedMenu(cafe);
  await seedTables(cafe);
  const hana = await connect(cafe, staffHeaders("hana")); // sends rounds over the WebSocket
  const kitchen = await connect(cafe, stationHeaders("kitchen"));
  const download = await signedInWaiter(cafe, "hana"); // Hana's tablet that downloads
  await open(hana, "s1", "table-7");
  return { cafe, hana, kitchen, download };
}

async function open(tablet: Tablet, sessionId: string, tableId: string) {
  tablet.send({ type: "session.open", idempotencyKey: key(), sessionId, tableId, guests: 2 });
  expect((await tablet.ack()).result).toMatchObject({ ok: true });
}

async function round(tablet: Tablet, orderId: string, sessionId: string, tableId: string, items: Array<[string, string]>) {
  tablet.send({
    type: "order.send",
    orderId,
    sessionId,
    tableId,
    createdAt: Date.now(),
    queuedOffline: false,
    items: items.map(([id, menuItemId]) => ({ id, menuItemId, qty: 1, note: null })),
  });
  expect((await tablet.ack()).result).toMatchObject({ ok: true });
}

async function act(tablet: Tablet, message: Record<string, unknown>) {
  tablet.send({ idempotencyKey: key(), ...message });
  return (await tablet.ack()).result;
}
const tap = (tablet: Tablet, itemId: string, type: string) => act(tablet, { type: "item.command", itemId, command: { type } });

describe("GET /lines (waiter reload)", () => {
  it("returns every line of the waiter's open tables with each item's state now", async () => {
    const { cafe, hana, kitchen, download } = await setup();
    await round(hana, "o1", "s1", "table-7", [["i1", "menu-shiro"], ["i2", "menu-macchiato"]]);
    await tap(kitchen, "i1", "accept");
    await tap(kitchen, "i1", "ready");

    const result = await cafe.tabletLines(download.token, download.sessionToken);

    if (!result.ok) throw new Error(result.error);
    expect(result.lines.map((l) => [l.itemId, l.orderId, l.state])).toEqual([
      ["i1", "o1", "ready"],
      ["i2", "o1", "sent"], // the bar's item too: a waiter sees the whole table
    ]);
    expect(details(result.lines[0]!)).toMatchObject({ tableId: "table-7", round: 1, name: "Shiro", qty: 1, priceSantim: expect.any(Number) });
    const [order] = await sql<{ received_at: number }>(cafe, "SELECT received_at FROM orders WHERE id = 'o1'");
    expect(result.lines[0]!.at).toBe(order!.received_at);
  });

  it("keeps finished lines of an open table (delivered, cancelled), as the waiter's screen shows them", async () => {
    const { cafe, hana, kitchen, download } = await setup();
    await round(hana, "o1", "s1", "table-7", [["i1", "menu-shiro"], ["i2", "menu-shiro"]]);
    await tap(hana, "i2", "cancel");
    await tap(kitchen, "i1", "accept");
    await tap(kitchen, "i1", "ready");
    await tap(hana, "i1", "delivered");

    const result = await cafe.tabletLines(download.token, download.sessionToken);

    expect(result.ok && result.lines.map((l) => [l.itemId, l.state])).toEqual([
      ["i1", "delivered"],
      ["i2", "cancelled"],
    ]);
  });

  it("leaves out closed tables and tables handed over to another waiter", async () => {
    const { cafe, hana, download } = await setup();
    await ensureStaff(cafe, "abel");
    await round(hana, "o1", "s1", "table-7", [["i1", "menu-shiro"]]);
    // An earlier visit at table 8, closed: its (cancelled) line is history.
    await open(hana, "s3", "table-8");
    await round(hana, "o3", "s3", "table-8", [["i3", "menu-shiro"]]);
    await tap(hana, "i3", "cancel");
    expect(await act(hana, { type: "session.close", sessionId: "s3" })).toMatchObject({ ok: true });
    // The next visit at table 8, handed over to Abel.
    await open(hana, "s2", "table-8");
    await round(hana, "o2", "s2", "table-8", [["i2", "menu-shiro"]]);
    expect(await act(hana, { type: "session.transfer", sessionId: "s2", toWaiterId: "abel" })).toMatchObject({ ok: true });

    const result = await cafe.tabletLines(download.token, download.sessionToken);

    expect(result.ok && result.lines.map((l) => l.itemId)).toEqual(["i1"]);
  });

  it("leaves out another waiter's tables", async () => {
    const { cafe, hana, download } = await setup();
    await round(hana, "o1", "s1", "table-7", [["i1", "menu-shiro"]]);
    const abel = await signedInWaiter(cafe, "abel");

    const result = await cafe.tabletLines(abel.token, abel.sessionToken);

    expect(result).toEqual({ ok: true, lines: [], seq: expect.any(Number) });
    expect((await cafe.tabletLines(download.token, download.sessionToken)).ok).toBe(true);
  });

  it("shows the table the line is on NOW, after a table move", async () => {
    const { cafe, hana, download } = await setup();
    await round(hana, "o1", "s1", "table-7", [["i1", "menu-shiro"]]);
    expect(await act(hana, { type: "session.move", sessionId: "s1", toTableId: "table-8" })).toMatchObject({ ok: true });

    const result = await cafe.tabletLines(download.token, download.sessionToken);

    expect(result.ok && details(result.lines[0]!)).toMatchObject({ tableId: "table-8" });
  });

  it("gives the newest event number, so the tablet continues catch-up from there", async () => {
    const { cafe, hana, download } = await setup();
    await round(hana, "o1", "s1", "table-7", [["i1", "menu-shiro"]]);

    const result = await cafe.tabletLines(download.token, download.sessionToken);

    const [last] = await sql<{ seq: number }>(cafe, "SELECT MAX(seq) AS seq FROM order_events");
    expect(result.ok && result.seq).toBe(last!.seq);
  });

  it("needs a waiter tablet with a live PIN session", async () => {
    const { cafe, download } = await setup();
    const station = await pairDevice(cafe, "station", "kitchen");

    expect(await cafe.tabletLines("not-a-token", download.sessionToken)).toEqual({ ok: false, error: "UNAUTHORIZED_DEVICE" });
    expect(await cafe.tabletLines(station.token, download.sessionToken)).toEqual({ ok: false, error: "NOT_A_WAITER_DEVICE" });
    expect(await cafe.tabletLines(download.token, "not-a-session")).toEqual({ ok: false, error: "SESSION_ENDED" });

    await cafe.signOut({ deviceToken: download.token, sessionToken: download.sessionToken });
    expect(await cafe.tabletLines(download.token, download.sessionToken)).toEqual({ ok: false, error: "SESSION_ENDED" });
  });

  it("the public route refuses a request without a device token or without a PIN session", async () => {
    expect((await call("GET", "/lines")).status).toBe(401);

    const { managerEmail } = await newAdminCafe();
    const token = await pairedWaiterTablet(managerEmail);
    const response = await call("GET", "/lines", { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "SESSION_ENDED" });
  });

  it("the public route gives a signed-in waiter the lines with details as objects", async () => {
    const { managerEmail, manager } = await newAdminCafe();
    const token = await pairedWaiterTablet(managerEmail);
    const signIn = await call("POST", "/auth/pin", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: { userId: manager.id, pin: "123456" },
    });
    const { sessionToken } = await json<{ sessionToken: string }>(signIn);

    const response = await call("GET", "/lines", { headers: { Authorization: `Bearer ${token}`, "X-Staff-Session": sessionToken } });

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ lines: [], seq: expect.any(Number) });
  });
});

/** A waiter tablet paired through the real routes (dashboard code, then POST /devices/pair). */
async function pairedWaiterTablet(email: string) {
  const created = await json<{ pairingCode: { code: string } }>(await admin("POST", "/admin/api/devices", email, { name: "Phone", kind: "waiter" }));
  const paired = await call("POST", "/devices/pair", {
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.31.${counter % 250}.${Math.floor(Math.random() * 250)}` },
    body: { code: created.pairingCode.code },
  });
  return (await json<{ token: string }>(paired)).token;
}
