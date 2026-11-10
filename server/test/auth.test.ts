import { describe, expect, it } from "vitest";
import {
  TEST_PIN,
  VENUE,
  connect,
  connectWith,
  ensureStaff,
  newCafe,
  pairDevice,
  seedMenu,
  seedTables,
  signedInWaiter,
  sql,
  staffHeaders,
  upgrade,
  type Cafe,
} from "./helpers";

const staff = (cafe: Cafe, id: string, role: "waiter" | "manager" | "owner", pin: string) =>
  cafe.createStaff({ venueId: VENUE, id, name: id, role, pin });

// ---------- staff and PINs ----------
describe("staff PINs", () => {
  it.each([
    ["too short", "waiter", "123"],
    ["too long", "waiter", "1234567"],
    ["not digits", "waiter", "12a4"],
    ["a 4-digit manager PIN (managers need 6, D-11)", "manager", "1234"],
    ["a 5-digit owner PIN", "owner", "12345"],
  ] as const)("refuses %s", async (_label, role, pin) => {
    const cafe = newCafe();
    expect(await staff(cafe, "x", role, pin)).toEqual({ ok: false, error: "INVALID_PIN" });
  });

  it("accepts a 4-digit waiter PIN and a 6-digit manager PIN, and refuses a duplicate id", async () => {
    const cafe = newCafe();
    expect(await staff(cafe, "hana", "waiter", "1234")).toEqual({ ok: true });
    expect(await staff(cafe, "abebe", "manager", "123456")).toEqual({ ok: true });
    expect(await staff(cafe, "hana", "waiter", "5678")).toEqual({ ok: false, error: "STAFF_EXISTS" });
  });

  it("stores only a salted, keyed hash: never the PIN, and equal PINs give different hashes", async () => {
    const cafe = newCafe();
    await staff(cafe, "hana", "waiter", "1234");
    await staff(cafe, "meron", "waiter", "1234");

    const rows = await sql<{ pin_hash: string; pin_salt: string }>(cafe, "SELECT pin_hash, pin_salt FROM staff");
    for (const row of rows) {
      expect(row.pin_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain("1234");
    }
    expect(rows[0]!.pin_hash).not.toBe(rows[1]!.pin_hash);
  });
});

describe("PIN sign-in", () => {
  async function setup() {
    const cafe = newCafe();
    await ensureStaff(cafe, "hana");
    const device = await pairDevice(cafe, "waiter");
    const signIn = (pin: string, userId = "hana") => cafe.signIn({ deviceToken: device.token, userId, pin });
    return { cafe, device, signIn };
  }

  it("the right PIN returns a session token and the user, and is written to the audit log", async () => {
    const { cafe, signIn } = await setup();

    const result = await signIn(TEST_PIN);

    expect(result).toMatchObject({ ok: true, user: { id: "hana", name: "Hana", role: "waiter" } });
    expect(result.ok && result.sessionToken.length).toBeGreaterThan(30);
    expect(await sql(cafe, "SELECT type FROM order_events")).toEqual([{ type: "auth.signed_in" }]);
  });

  it("a wrong PIN or an unknown user gives the same answer", async () => {
    const { signIn } = await setup();
    expect(await signIn("9999")).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
    expect(await signIn(TEST_PIN, "nobody")).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
  });

  it("5 wrong PINs lock the user for 5 minutes, even for the right PIN; then sign-in works again", async () => {
    const { cafe, signIn } = await setup();
    for (let i = 0; i < 4; i++) expect(await signIn("9999")).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });

    expect(await signIn("9999")).toMatchObject({ ok: false, error: "LOCKED" });
    const locked = await signIn(TEST_PIN);
    expect(locked).toMatchObject({ ok: false, error: "LOCKED" });
    expect(!locked.ok && "retryAfterMs" in locked && locked.retryAfterMs).toBeGreaterThan(4 * 60_000);
    expect(await sql(cafe, "SELECT type FROM order_events WHERE type = 'auth.locked'")).toHaveLength(1);

    await sql(cafe, "UPDATE staff SET locked_until = 0 WHERE id = 'hana'"); // 5 minutes later
    expect(await signIn(TEST_PIN)).toMatchObject({ ok: true });
  });

  it("parallel wrong guesses are all counted (the lockout check is not raced)", async () => {
    const { signIn } = await setup();
    await Promise.all(Array.from({ length: 5 }, () => signIn("9999")));
    expect(await signIn(TEST_PIN)).toMatchObject({ ok: false, error: "LOCKED" });
  });

  it("a deactivated staff member cannot sign in", async () => {
    const { cafe, signIn } = await setup();
    expect(await cafe.deactivateStaff("hana")).toEqual({ ok: true });
    expect(await signIn(TEST_PIN)).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
  });

  it("a kitchen tablet cannot be used to sign in a waiter", async () => {
    const cafe = newCafe();
    await ensureStaff(cafe, "hana");
    const station = await pairDevice(cafe, "station", "kitchen");
    expect(await cafe.signIn({ deviceToken: station.token, userId: "hana", pin: TEST_PIN })).toEqual({
      ok: false,
      error: "NOT_A_WAITER_DEVICE",
    });
  });

  it("a revoked device can no longer sign in or list staff", async () => {
    const { cafe, device, signIn } = await setup();
    expect(await cafe.revokeDevice(device.deviceId)).toEqual({ ok: true });
    expect(await signIn(TEST_PIN)).toEqual({ ok: false, error: "UNAUTHORIZED_DEVICE" });
    expect(await cafe.listStaff(device.token)).toEqual({ ok: false, error: "UNAUTHORIZED_DEVICE" });
  });

  it("listStaff returns active staff names and roles only", async () => {
    const { cafe, device } = await setup();
    await ensureStaff(cafe, "meron");
    await ensureStaff(cafe, "dawit");
    await cafe.deactivateStaff("dawit");

    expect(await cafe.listStaff(device.token)).toEqual({
      ok: true,
      staff: [
        { id: "hana", name: "Hana", role: "waiter" },
        { id: "meron", name: "Meron", role: "waiter" },
      ],
    });
  });
});

// ---------- connecting ----------
describe("connecting with tokens", () => {
  it("a wrong token, or a waiter token without a PIN session, is refused with 401", async () => {
    const cafe = newCafe();
    const device = await pairDevice(cafe, "waiter");

    expect((await upgrade(cafe, { Authorization: "Bearer nonsense" })).status).toBe(401);
    expect((await upgrade(cafe, { Authorization: `Bearer ${device.token}x` })).status).toBe(401);
    expect((await upgrade(cafe, { Authorization: `Bearer ${device.token}` })).status).toBe(401);
  });

  it("a PIN session only works from the device it was created on", async () => {
    const cafe = newCafe();
    const hana = await signedInWaiter(cafe, "hana");
    const other = await pairDevice(cafe, "waiter");

    const response = await upgrade(cafe, { Authorization: `Bearer ${other.token}`, "X-Staff-Session": hana.sessionToken });
    expect(response.status).toBe(401);
  });

  it("an expired or signed-out session is refused", async () => {
    const cafe = newCafe();
    const a = await signedInWaiter(cafe, "hana");
    const b = await signedInWaiter(cafe, "meron");
    await sql(cafe, "UPDATE staff_sessions SET expires_at = 0 WHERE user_id = 'hana'");
    expect(await cafe.signOut({ deviceToken: b.token, sessionToken: b.sessionToken })).toEqual({ ok: true });

    for (const s of [a, b]) {
      expect((await upgrade(cafe, { Authorization: `Bearer ${s.token}`, "X-Staff-Session": s.sessionToken })).status).toBe(401);
    }
  });

  it("revoking a device closes its open socket at once, and it cannot reconnect", async () => {
    const cafe = newCafe();
    const device = await pairDevice(cafe, "station", "kitchen");
    const tablet = await connectWith(cafe, { Authorization: `Bearer ${device.token}` });

    await cafe.revokeDevice(device.deviceId);

    expect(await tablet.closed).toBe(4001);
    expect((await upgrade(cafe, { Authorization: `Bearer ${device.token}` })).status).toBe(401);
  });

  it("deactivating a staff member closes their sockets and ends their sessions", async () => {
    const cafe = newCafe();
    const hana = await signedInWaiter(cafe, "hana");
    const headers = { Authorization: `Bearer ${hana.token}`, "X-Staff-Session": hana.sessionToken };
    const tablet = await connectWith(cafe, headers);

    await cafe.deactivateStaff("hana");

    expect(await tablet.closed).toBe(4001);
    expect((await upgrade(cafe, headers)).status).toBe(401);
  });

  it("a session that expires while connected is refused on the next command and the socket closes", async () => {
    const cafe = newCafe();
    await seedTables(cafe);
    const hana = await connect(cafe, staffHeaders("hana"));
    await sql(cafe, "UPDATE staff_sessions SET expires_at = 0");

    hana.send({ type: "session.open", idempotencyKey: "k1", sessionId: "s1", tableId: "table-7", guests: null });

    expect(await hana.next()).toEqual({ type: "error", error: "SESSION_ENDED" });
    expect(await hana.closed).toBe(4001);
    expect(await sql(cafe, "SELECT COUNT(*) AS n FROM table_sessions")).toEqual([{ n: 0 }]);
  });

  it("tickets carry the waiter's name", async () => {
    const cafe = newCafe();
    await seedMenu(cafe);
    await seedTables(cafe);
    const hana = await connect(cafe, staffHeaders("hana"));
    hana.send({ type: "session.open", idempotencyKey: "k1", sessionId: "s1", tableId: "table-7", guests: null });
    await hana.ack();

    hana.send({
      type: "order.send",
      orderId: "o1",
      sessionId: "s1",
      tableId: "table-7",
      createdAt: Date.now(),
      queuedOffline: false,
      items: [{ id: "oi1", menuItemId: "menu-shiro", qty: 1, note: null }],
    });
    await hana.ack();

    const [event] = await sql<{ details: string }>(cafe, "SELECT details FROM order_events WHERE type = 'item.sent'");
    expect(JSON.parse(event!.details)).toMatchObject({ waiterId: "hana", waiterName: "Hana" });
  });
});
