/** The dashboard's admin API (D1a): bootstrap, Access login, staff and tablets, permissions, CSRF. */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { admin, cafeWithManager, call, counter, json, newCafe, uid } from "./adminHelpers";

// ---------- bootstrap ----------
describe("POST /installer/venues", () => {
  it("creates a café and its owner, who can then use the dashboard", async () => {
    const { venueId, ownerEmail } = await newCafe("Abebe Cafe");

    const me = await admin("GET", "/admin/api/me", ownerEmail);

    expect(me.status).toBe(200);
    expect(await json(me)).toMatchObject({ user: { role: "owner", name: "Abebe", email: ownerEmail }, venue: { id: venueId, name: "Abebe Cafe" } });
  });

  it("needs the installer secret", async () => {
    for (const authorization of ["", "Bearer wrong-secret"]) {
      const response = await call("POST", "/installer/venues", {
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body: { name: "X", ownerName: "Y", ownerEmail: `x-${uid()}@example.com`, ownerPin: "123456" },
      });
      expect(response.status).toBe(401);
    }
  });

  it("refuses an owner email that already belongs to a café (409) and invalid input (400)", async () => {
    const { ownerEmail } = await newCafe();
    const send = (body: unknown) =>
      call("POST", "/installer/venues", { headers: { Authorization: "Bearer test-installer-secret", "Content-Type": "application/json" }, body });

    expect((await send({ name: "Second", ownerName: "Y", ownerEmail, ownerPin: "123456" })).status).toBe(409);
    expect((await send({ name: "", ownerName: "Y", ownerEmail: `z-${uid()}@example.com`, ownerPin: "123456" })).status).toBe(400);
    expect((await send({ name: "Z", ownerName: "Y", ownerEmail: "not-an-email", ownerPin: "123456" })).status).toBe(400);
    expect((await send({ name: "Z", ownerName: "Y", ownerEmail: `z-${uid()}@example.com`, ownerPin: "1234" })).status).toBe(400);
  });
});

// ---------- login ----------
describe("dashboard login", () => {
  it("no Access token is 401; a valid token for an email no café knows is 403", async () => {
    expect((await call("GET", "/admin/api/me")).status).toBe(401);
    expect((await admin("GET", "/admin/api/me", `stranger-${uid()}@example.com`)).status).toBe(403);
  });

  it("a deactivated manager loses dashboard access at once", async () => {
    const { ownerEmail, managerEmail, managerId } = await cafeWithManager();
    expect((await admin("GET", "/admin/api/me", managerEmail)).status).toBe(200);

    expect((await admin("POST", `/admin/api/staff/${managerId}/deactivate`, ownerEmail, {})).status).toBe(200);

    expect((await admin("GET", "/admin/api/me", managerEmail)).status).toBe(403);
  });

  it("a waiter (no dashboard role) cannot use the dashboard even with an email", async () => {
    const { ownerEmail } = await newCafe();
    const waiterEmail = `waiter-${uid()}@example.com`;
    expect((await admin("POST", "/admin/api/staff", ownerEmail, { name: "Hana", role: "waiter", pin: "1234", email: waiterEmail })).status).toBe(201);
    expect((await admin("GET", "/admin/api/me", waiterEmail)).status).toBe(403);
  });
});

// ---------- CSRF ----------
describe("cross-site request protection", () => {
  it("a change without our Origin header, or from another site, is refused", async () => {
    const { ownerEmail } = await newCafe();
    const body = { name: "Hana", role: "waiter", pin: "1234" };
    expect((await admin("POST", "/admin/api/staff", ownerEmail, body, { Origin: "" })).status).toBe(403);
    expect((await admin("POST", "/admin/api/staff", ownerEmail, body, { Origin: "https://evil.example" })).status).toBe(403);
  });

  it("a change that is not JSON is refused (a forged HTML form can't send JSON)", async () => {
    const { ownerEmail } = await newCafe();
    const response = await admin("POST", "/admin/api/staff", ownerEmail, "name=Hana", { "Content-Type": "application/x-www-form-urlencoded" });
    expect(response.status).toBe(415);
  });
});

// ---------- staff ----------
describe("staff", () => {
  it("the owner creates a waiter; the list shows staff without any PIN data; the action is audited", async () => {
    const { ownerEmail, owner, venueId } = await newCafe();

    const created = await admin("POST", "/admin/api/staff", ownerEmail, { name: "Hana", role: "waiter", pin: "1234" });
    expect(created.status).toBe(201);

    const list = await json<{ staff: Array<Record<string, unknown>> }>(await admin("GET", "/admin/api/staff", ownerEmail));
    expect(list.staff.map((s) => [s.name, s.role, s.active])).toEqual([
      ["Abebe", "owner", true],
      ["Hana", "waiter", true],
    ]);
    expect(JSON.stringify(list)).not.toMatch(/pin|salt|hash/i);

    const cafe = env.CAFE.get(env.CAFE.idFromName(venueId));
    const events = await cafe.auditLog(10);
    expect(events).toContainEqual(expect.objectContaining({ type: "staff.created", actor: { kind: "staff", userId: owner.id } }));
  });

  it("a manager can create waiters and managers, but not owners", async () => {
    const { managerEmail } = await cafeWithManager();
    expect((await admin("POST", "/admin/api/staff", managerEmail, { name: "Hana", role: "waiter", pin: "1234" })).status).toBe(201);
    expect((await admin("POST", "/admin/api/staff", managerEmail, { name: "Dawit", role: "manager", pin: "111111" })).status).toBe(201);

    const owner = await admin("POST", "/admin/api/staff", managerEmail, { name: "New owner", role: "owner", pin: "222222" });
    expect(owner.status).toBe(403);
    expect(await json(owner)).toEqual({ error: "FORBIDDEN" });
  });

  it("a manager cannot deactivate or reset the PIN of an owner", async () => {
    const { managerEmail, owner } = await cafeWithManager();
    expect((await admin("POST", `/admin/api/staff/${owner.id}/deactivate`, managerEmail, {})).status).toBe(403);
    expect((await admin("POST", `/admin/api/staff/${owner.id}/pin`, managerEmail, { pin: "999999" })).status).toBe(403);
  });

  it("nobody can deactivate themselves (a café can't lose its last owner by accident)", async () => {
    const { ownerEmail, owner } = await newCafe();
    const response = await admin("POST", `/admin/api/staff/${owner.id}/deactivate`, ownerEmail, {});
    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ error: "CANNOT_DEACTIVATE_SELF" });
  });

  it("a PIN reset sets the new PIN and clears a lockout", async () => {
    const { ownerEmail, venueId } = await newCafe();
    const created = await json<{ staff: { id: string } }>(await admin("POST", "/admin/api/staff", ownerEmail, { name: "Hana", role: "waiter", pin: "1234" }));
    const cafe = env.CAFE.get(env.CAFE.idFromName(venueId));
    await cafe.createDevice({ venueId, id: "tab-1", name: "Tab 1", kind: "waiter", stationId: null });
    const paired = await cafe.completePairing("tab-1");
    if (!paired.ok) throw new Error(paired.error);
    for (let i = 0; i < 5; i++) await cafe.signIn({ deviceToken: paired.token, userId: created.staff.id, pin: "0000" });
    expect(await cafe.signIn({ deviceToken: paired.token, userId: created.staff.id, pin: "1234" })).toMatchObject({ error: "LOCKED" });

    expect((await admin("POST", `/admin/api/staff/${created.staff.id}/pin`, ownerEmail, { pin: "5678" })).status).toBe(200);

    expect(await cafe.signIn({ deviceToken: paired.token, userId: created.staff.id, pin: "5678" })).toMatchObject({ ok: true });
  });

  it.each([
    ["an invalid PIN", { name: "Hana", role: "waiter", pin: "12" }],
    ["a 4-digit manager PIN", { name: "Dawit", role: "manager", pin: "1234" }],
    ["an unknown role", { name: "X", role: "chef", pin: "1234" }],
    ["an empty name", { name: " ", role: "waiter", pin: "1234" }],
    ["an invalid email", { name: "X", role: "manager", pin: "123456", email: "nope" }],
  ])("refuses %s with 400", async (_label, body) => {
    const { ownerEmail } = await newCafe();
    expect((await admin("POST", "/admin/api/staff", ownerEmail, body)).status).toBe(400);
  });

  it("an email can belong to only one person in the whole system (409)", async () => {
    const { ownerEmail } = await newCafe();
    const other = await newCafe();
    const response = await admin("POST", "/admin/api/staff", ownerEmail, { name: "X", role: "manager", pin: "123456", email: other.ownerEmail });
    expect(response.status).toBe(409);
  });

  it("staff of another café are not found (404)", async () => {
    const a = await newCafe();
    const b = await newCafe();
    expect((await admin("POST", `/admin/api/staff/${b.owner.id}/deactivate`, a.ownerEmail, {})).status).toBe(404);
  });
});

// ---------- tablets ----------
describe("tablets", () => {
  it("adding a tablet returns a pairing code that pairs it; the list shows its status", async () => {
    const { ownerEmail } = await newCafe();

    const created = await admin("POST", "/admin/api/devices", ownerEmail, { name: "Kitchen 1", kind: "station", stationId: "kitchen" });
    expect(created.status).toBe(201);
    const { device, pairingCode } = await json<{ device: { id: string }; pairingCode: { code: string } }>(created);
    expect(pairingCode.code).toMatch(/^\d{6}$/);

    const pair = await call("POST", "/devices/pair", { headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.9.${counter}.1` }, body: { code: pairingCode.code } });
    expect(pair.status).toBe(200);

    const list = await json<{ devices: unknown[] }>(await admin("GET", "/admin/api/devices", ownerEmail));
    expect(list.devices).toEqual([{ id: device.id, name: "Kitchen 1", kind: "station", stationId: "kitchen", status: "paired" }]);
  });

  it("a new pairing code can be made for an unpaired tablet, not for a paired one", async () => {
    const { ownerEmail } = await newCafe();
    const { device, pairingCode } = await json<{ device: { id: string }; pairingCode: { code: string } }>(
      await admin("POST", "/admin/api/devices", ownerEmail, { name: "Tab", kind: "waiter", stationId: null }),
    );
    expect((await admin("POST", `/admin/api/devices/${device.id}/pairing-code`, ownerEmail, {})).status).toBe(200);

    // The old code stopped working when the new one was made.
    const old = await call("POST", "/devices/pair", { headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.8.${counter}.1` }, body: { code: pairingCode.code } });
    expect(old.status).toBe(401);
  });

  it("revoking a tablet stops its token and shows it as revoked", async () => {
    const { ownerEmail } = await newCafe();
    const { device, pairingCode } = await json<{ device: { id: string }; pairingCode: { code: string } }>(
      await admin("POST", "/admin/api/devices", ownerEmail, { name: "Tab", kind: "waiter", stationId: null }),
    );
    const paired = await json<{ token: string }>(
      await call("POST", "/devices/pair", { headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.7.${counter}.1` }, body: { code: pairingCode.code } }),
    );

    expect((await admin("POST", `/admin/api/devices/${device.id}/revoke`, ownerEmail, {})).status).toBe(200);

    expect((await call("GET", "/staff", { headers: { Authorization: `Bearer ${paired.token}` } })).status).toBe(401);
    const list = await json<{ devices: Array<{ status: string }> }>(await admin("GET", "/admin/api/devices", ownerEmail));
    expect(list.devices[0]!.status).toBe("revoked");
  });

  it.each([
    ["a station without a station id", { name: "K", kind: "station", stationId: null }],
    ["a waiter tablet with a station id", { name: "T", kind: "waiter", stationId: "kitchen" }],
    ["an unknown kind", { name: "T", kind: "phone", stationId: null }],
  ])("refuses %s with 400", async (_label, body) => {
    const { ownerEmail } = await newCafe();
    expect((await admin("POST", "/admin/api/devices", ownerEmail, body)).status).toBe(400);
  });
});

it("unknown admin routes are 404", async () => {
  const { ownerEmail } = await newCafe();
  expect((await admin("GET", "/admin/api/nope", ownerEmail)).status).toBe(404);
});
