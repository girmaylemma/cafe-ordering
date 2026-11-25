/**
 * M1a (design 5.1, PIN half): a PIN set by someone else is temporary. At the next sign-in the
 * person must choose their own before anything else; anyone can change their own PIN any time.
 * Through the public routes, as a tablet uses them.
 */
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { admin, call, json, newCafe } from "./adminHelpers";

const cafeDo = (venueId: string) => env.CAFE.get(env.CAFE.idFromName(venueId));

/** A waiter tablet paired through the real routes (dashboard code, then POST /devices/pair). */
async function pairedWaiterTablet(email: string) {
  const created = await json<{ pairingCode: { code: string } }>(await admin("POST", "/admin/api/devices", email, { name: "Phone", kind: "waiter" }));
  const paired = await call("POST", "/devices/pair", {
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.44.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    body: { code: created.pairingCode.code },
  });
  return (await json<{ token: string }>(paired)).token;
}

/** A café, a waiter Hana created by its manager in the dashboard (PIN 1234), and a paired tablet. */
async function setup() {
  const cafe = await newCafe();
  const created = await json<{ staff: { id: string } }>(await admin("POST", "/admin/api/staff", cafe.managerEmail, { name: "Hana", role: "waiter", pin: "1234" }));
  const tablet = await pairedWaiterTablet(cafe.managerEmail);
  return { ...cafe, hanaId: created.staff.id, tablet };
}

const signIn = (tablet: string, userId: string, pin: string) =>
  call("POST", "/auth/pin", { headers: { Authorization: `Bearer ${tablet}`, "Content-Type": "application/json" }, body: { userId, pin } });

const changePin = (tablet: string, session: string, currentPin: string, newPin: string) =>
  call("POST", "/auth/pin/change", {
    headers: { Authorization: `Bearer ${tablet}`, "X-Staff-Session": session, "Content-Type": "application/json" },
    body: { currentPin, newPin },
  });

const lines = (tablet: string, session: string) => call("GET", "/lines", { headers: { Authorization: `Bearer ${tablet}`, "X-Staff-Session": session } });
const socket = (tablet: string, session: string) =>
  call("GET", "/ws", { headers: { Authorization: `Bearer ${tablet}`, "X-Staff-Session": session, Upgrade: "websocket" } });

async function sessionOf(response: Response) {
  return (await json<{ sessionToken: string }>(response)).sessionToken;
}

describe("temporary PIN (M1a)", () => {
  it("a waiter created in the dashboard must choose their own PIN at first sign-in", async () => {
    const { tablet, hanaId } = await setup();

    const response = await signIn(tablet, hanaId, "1234");

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ mustChangePin: true, user: { id: hanaId } });
  });

  it("until then the session is refused: GET /lines and the WebSocket answer PIN_CHANGE_REQUIRED", async () => {
    const { tablet, hanaId } = await setup();
    const session = await sessionOf(await signIn(tablet, hanaId, "1234"));

    const download = await lines(tablet, session);
    expect(download.status).toBe(401);
    expect(await json(download)).toEqual({ error: "PIN_CHANGE_REQUIRED" });
    const upgrade = await socket(tablet, session);
    expect(upgrade.status).toBe(401);
    expect(await json(upgrade)).toEqual({ error: "PIN_CHANGE_REQUIRED" });
  });

  it("the change route sets the new PIN: the old one stops working, the new one signs in plainly, and the session works", async () => {
    const { tablet, hanaId } = await setup();
    const session = await sessionOf(await signIn(tablet, hanaId, "1234"));

    const changed = await changePin(tablet, session, "1234", "8642");
    expect(changed.status).toBe(200);
    expect(await json(changed)).toEqual({ ok: true });

    expect((await lines(tablet, session)).status).toBe(200);
    expect((await signIn(tablet, hanaId, "1234")).status).toBe(401);
    const again = await signIn(tablet, hanaId, "8642");
    expect(again.status).toBe(200);
    expect(await json(again)).toMatchObject({ mustChangePin: false });
  });

  it("a wrong current PIN is refused and counts toward the shared lockout: sign-in is locked too", async () => {
    const { tablet, hanaId, venueId } = await setup();
    const session = await sessionOf(await signIn(tablet, hanaId, "1234"));

    const wrong = await changePin(tablet, session, "0000", "8642");
    expect(wrong.status).toBe(401);
    expect(await json(wrong)).toEqual({ error: "INVALID_CREDENTIALS" });
    for (let i = 0; i < 3; i++) await changePin(tablet, session, "0000", "8642");
    const fifth = await changePin(tablet, session, "0000", "8642");
    expect(fifth.status).toBe(423);
    expect(await json(fifth)).toMatchObject({ error: "LOCKED", retryAfterMs: expect.any(Number) });

    expect((await signIn(tablet, hanaId, "1234")).status).toBe(423); // one counter per person (D-58)
    expect(await cafeDo(venueId).auditLog(20)).toContainEqual(expect.objectContaining({ type: "auth.locked" }));
  });

  it.each([
    ["breaks the waiter rule", "12", "INVALID_PIN"],
    ["is the same as the current one", "1234", "SAME_PIN"],
  ])("a new PIN that %s is refused", async (_label, newPin, error) => {
    const { tablet, hanaId } = await setup();
    const session = await sessionOf(await signIn(tablet, hanaId, "1234"));

    const response = await changePin(tablet, session, "1234", newPin);

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error });
    expect((await lines(tablet, session)).status).toBe(401); // still must change
  });

  it("a PIN reset in the dashboard is temporary again and stops the person's session until they choose", async () => {
    const { tablet, hanaId, managerEmail } = await setup();
    const session = await sessionOf(await signIn(tablet, hanaId, "1234"));
    await changePin(tablet, session, "1234", "8642");
    expect((await lines(tablet, session)).status).toBe(200);

    expect((await admin("POST", `/admin/api/staff/${hanaId}/pin`, managerEmail, { pin: "5555" })).status).toBe(200);

    expect(await json(await lines(tablet, session))).toEqual({ error: "PIN_CHANGE_REQUIRED" });
    expect(await json(await signIn(tablet, hanaId, "5555"))).toMatchObject({ mustChangePin: true });
  });

  it("staff from before migration 9 are not temporary", async () => {
    const { tablet, hanaId, venueId } = await setup();
    await runInDurableObject(cafeDo(venueId), (_instance, state) => state.storage.sql.exec("UPDATE staff SET pin_must_change = 0 WHERE id = ?", hanaId));

    expect(await json(await signIn(tablet, hanaId, "1234"))).toMatchObject({ mustChangePin: false });
  });

  it("every change is audited, never with the PIN", async () => {
    const { tablet, hanaId, venueId } = await setup();
    const session = await sessionOf(await signIn(tablet, hanaId, "1234"));

    await changePin(tablet, session, "1234", "8642");

    const events = await cafeDo(venueId).auditLog(20);
    expect(events).toContainEqual(expect.objectContaining({ type: "auth.pin_changed", actor: { kind: "staff", userId: hanaId }, details: expect.stringContaining('"wasTemporary":true') }));
    expect(JSON.stringify(events)).not.toContain("8642");
  });
});
