/** The dashboard's admin API (D1a): bootstrap, Access login, staff and tablets, permissions, CSRF. */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { admin, cafeWithManager, call, counter, json, newCafe, uid } from "./adminHelpers";

// ---------- bootstrap ----------
describe("POST /installer/venues", () => {
  it("creates a café and its first manager, who can then use the dashboard", async () => {
    const { venueId, managerEmail } = await newCafe("Abebe Cafe");

    const me = await admin("GET", "/admin/api/me", managerEmail);

    expect(me.status).toBe(200);
    expect(await json(me)).toMatchObject({ user: { role: "manager", name: "Abebe", email: managerEmail }, venue: { id: venueId, name: "Abebe Cafe" } });
  });

  it("needs the installer secret", async () => {
    for (const authorization of ["", "Bearer wrong-secret"]) {
      const response = await call("POST", "/installer/venues", {
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body: { name: "X", managerName: "Y", managerEmail: `x-${uid()}@example.com`, managerPin: "123456" },
      });
      expect(response.status).toBe(401);
    }
  });

  it("refuses a manager email that already belongs to a café (409) and invalid input (400)", async () => {
    const { managerEmail } = await newCafe();
    const send = (body: unknown) =>
      call("POST", "/installer/venues", { headers: { Authorization: "Bearer test-installer-secret", "Content-Type": "application/json" }, body });

    expect((await send({ name: "Second", managerName: "Y", managerEmail, managerPin: "123456" })).status).toBe(409);
    expect((await send({ name: "", managerName: "Y", managerEmail: `z-${uid()}@example.com`, managerPin: "123456" })).status).toBe(400);
    expect((await send({ name: "Z", managerName: "Y", managerEmail: "not-an-email", managerPin: "123456" })).status).toBe(400);
    expect((await send({ name: "Z", managerName: "Y", managerEmail: `z-${uid()}@example.com`, managerPin: "1234" })).status).toBe(400);
  });
});

// ---------- login ----------
describe("dashboard login", () => {
  it("no Access token is 401; a valid token for an email no café knows is 403", async () => {
    expect((await call("GET", "/admin/api/me")).status).toBe(401);
    expect((await admin("GET", "/admin/api/me", `stranger-${uid()}@example.com`)).status).toBe(403);
  });

  it("a deactivated manager loses dashboard access at once", async () => {
    const { venueId, otherManagerEmail, otherManagerId } = await cafeWithManager();
    expect((await admin("GET", "/admin/api/me", otherManagerEmail)).status).toBe(200);

    // Only the developer deactivates managers (D-97): the café method the developer console will call (M4).
    expect(await env.CAFE.get(env.CAFE.idFromName(venueId)).deactivateStaff(otherManagerId)).toEqual({ ok: true });

    expect((await admin("GET", "/admin/api/me", otherManagerEmail)).status).toBe(403);
  });

  it("a waiter (no dashboard role) cannot use the dashboard even with an email", async () => {
    const { managerEmail } = await newCafe();
    const waiterEmail = `waiter-${uid()}@example.com`;
    expect((await admin("POST", "/admin/api/staff", managerEmail, { name: "Hana", role: "waiter", pin: "1234", email: waiterEmail })).status).toBe(201);
    expect((await admin("GET", "/admin/api/me", waiterEmail)).status).toBe(403);
  });
});

// ---------- CSRF ----------
describe("cross-site request protection", () => {
  it("a change without our Origin header, or from another site, is refused", async () => {
    const { managerEmail } = await newCafe();
    const body = { name: "Hana", role: "waiter", pin: "1234" };
    expect((await admin("POST", "/admin/api/staff", managerEmail, body, { Origin: "" })).status).toBe(403);
    expect((await admin("POST", "/admin/api/staff", managerEmail, body, { Origin: "https://evil.example" })).status).toBe(403);
  });

  it("a change that is not JSON is refused (a forged HTML form can't send JSON)", async () => {
    const { managerEmail } = await newCafe();
    const response = await admin("POST", "/admin/api/staff", managerEmail, "name=Hana", { "Content-Type": "application/x-www-form-urlencoded" });
    expect(response.status).toBe(415);
  });
});

// ---------- staff ----------
describe("staff", () => {
  it("a manager creates a waiter; the list shows staff without any PIN data; the action is audited", async () => {
    const { managerEmail, manager, venueId } = await newCafe();

    const created = await admin("POST", "/admin/api/staff", managerEmail, { name: "Hana", role: "waiter", pin: "1234" });
    expect(created.status).toBe(201);

    const list = await json<{ staff: Array<Record<string, unknown>> }>(await admin("GET", "/admin/api/staff", managerEmail));
    expect(list.staff.map((s) => [s.name, s.role, s.active])).toEqual([
      ["Abebe", "manager", true],
      ["Hana", "waiter", true],
    ]);
    expect(JSON.stringify(list)).not.toMatch(/pin|salt|hash/i);

    const cafe = env.CAFE.get(env.CAFE.idFromName(venueId));
    const events = await cafe.auditLog(10);
    expect(events).toContainEqual(expect.objectContaining({ type: "staff.created", actor: { kind: "staff", userId: manager.id } }));
  });


  it("nobody can deactivate themselves (a café can't lose its last owner by accident)", async () => {
    const { managerEmail, manager } = await newCafe();
    const response = await admin("POST", `/admin/api/staff/${manager.id}/deactivate`, managerEmail, {});
    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ error: "CANNOT_DEACTIVATE_SELF" });
  });

  it("a PIN reset sets the new PIN and clears a lockout", async () => {
    const { managerEmail, venueId } = await newCafe();
    const created = await json<{ staff: { id: string } }>(await admin("POST", "/admin/api/staff", managerEmail, { name: "Hana", role: "waiter", pin: "1234" }));
    const cafe = env.CAFE.get(env.CAFE.idFromName(venueId));
    await cafe.createDevice({ venueId, id: "tab-1", name: "Tab 1", kind: "waiter", stationId: null });
    const paired = await cafe.completePairing("tab-1");
    if (!paired.ok) throw new Error(paired.error);
    for (let i = 0; i < 5; i++) await cafe.signIn({ deviceToken: paired.token, userId: created.staff.id, pin: "0000" });
    expect(await cafe.signIn({ deviceToken: paired.token, userId: created.staff.id, pin: "1234" })).toMatchObject({ error: "LOCKED" });

    expect((await admin("POST", `/admin/api/staff/${created.staff.id}/pin`, managerEmail, { pin: "5678" })).status).toBe(200);

    expect(await cafe.signIn({ deviceToken: paired.token, userId: created.staff.id, pin: "5678" })).toMatchObject({ ok: true });
  });

  it.each([
    ["an invalid PIN", { name: "Hana", role: "waiter", pin: "12" }],
    ["an unknown role", { name: "X", role: "chef", pin: "1234" }],
    ["an empty name", { name: " ", role: "waiter", pin: "1234" }],
    ["an invalid email", { name: "X", role: "waiter", pin: "1234", email: "nope" }],
  ])("refuses %s with 400", async (_label, body) => {
    const { managerEmail } = await newCafe();
    expect((await admin("POST", "/admin/api/staff", managerEmail, body)).status).toBe(400);
  });

  it("an email can belong to only one person in the whole system (409)", async () => {
    const { managerEmail } = await newCafe();
    const other = await newCafe();
    const response = await admin("POST", "/admin/api/staff", managerEmail, { name: "X", role: "waiter", pin: "1234", email: other.managerEmail });
    expect(response.status).toBe(409);
  });

  it("staff of another café are not found (404)", async () => {
    const a = await newCafe();
    const b = await newCafe();
    expect((await admin("POST", `/admin/api/staff/${b.manager.id}/deactivate`, a.managerEmail, {})).status).toBe(404);
  });
});

// ---------- tablets ----------
describe("tablets", () => {
  it("adding a tablet returns a pairing code that pairs it; the list shows its status", async () => {
    const { managerEmail } = await newCafe();

    const created = await admin("POST", "/admin/api/devices", managerEmail, { name: "Kitchen 1", kind: "station", stationId: "kitchen" });
    expect(created.status).toBe(201);
    const { device, pairingCode } = await json<{ device: { id: string }; pairingCode: { code: string } }>(created);
    expect(pairingCode.code).toMatch(/^\d{6}$/);

    const pair = await call("POST", "/devices/pair", { headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.9.${counter}.1` }, body: { code: pairingCode.code } });
    expect(pair.status).toBe(200);

    const list = await json<{ devices: unknown[] }>(await admin("GET", "/admin/api/devices", managerEmail));
    expect(list.devices).toEqual([{ id: device.id, name: "Kitchen 1", kind: "station", stationId: "kitchen", status: "paired" }]);
  });

  it("a new pairing code can be made for an unpaired tablet, not for a paired one", async () => {
    const { managerEmail } = await newCafe();
    const { device, pairingCode } = await json<{ device: { id: string }; pairingCode: { code: string } }>(
      await admin("POST", "/admin/api/devices", managerEmail, { name: "Tab", kind: "waiter", stationId: null }),
    );
    expect((await admin("POST", `/admin/api/devices/${device.id}/pairing-code`, managerEmail, {})).status).toBe(200);

    // The old code stopped working when the new one was made.
    const old = await call("POST", "/devices/pair", { headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.8.${counter}.1` }, body: { code: pairingCode.code } });
    expect(old.status).toBe(401);
  });

  it("revoking a tablet stops its token and shows it as revoked", async () => {
    const { managerEmail } = await newCafe();
    const { device, pairingCode } = await json<{ device: { id: string }; pairingCode: { code: string } }>(
      await admin("POST", "/admin/api/devices", managerEmail, { name: "Tab", kind: "waiter", stationId: null }),
    );
    const paired = await json<{ token: string }>(
      await call("POST", "/devices/pair", { headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.7.${counter}.1` }, body: { code: pairingCode.code } }),
    );

    expect((await admin("POST", `/admin/api/devices/${device.id}/revoke`, managerEmail, {})).status).toBe(200);

    expect((await call("GET", "/staff", { headers: { Authorization: `Bearer ${paired.token}` } })).status).toBe(401);
    const list = await json<{ devices: Array<{ status: string }> }>(await admin("GET", "/admin/api/devices", managerEmail));
    expect(list.devices[0]!.status).toBe("revoked");
  });

  it.each([
    ["a station without a station id", { name: "K", kind: "station", stationId: null }],
    ["a waiter tablet with a station id", { name: "T", kind: "waiter", stationId: "kitchen" }],
    ["an unknown kind", { name: "T", kind: "phone", stationId: null }],
  ])("refuses %s with 400", async (_label, body) => {
    const { managerEmail } = await newCafe();
    expect((await admin("POST", "/admin/api/devices", managerEmail, body)).status).toBe(400);
  });
});

it("unknown admin routes are 404", async () => {
  const { managerEmail } = await newCafe();
  expect((await admin("GET", "/admin/api/nope", managerEmail)).status).toBe(404);
});

// ---------- no owner role (M0, D-97) ----------
describe("no owner role (M0, D-97)", () => {
  const INSTALLER = { Authorization: "Bearer test-installer-secret", "Content-Type": "application/json" };
  async function installCafe() {
    const managerEmail = `first-${uid()}@example.com`;
    const response = await call("POST", "/installer/venues", { headers: INSTALLER, body: { name: "Abebe Cafe", managerName: "Meron", managerEmail, managerPin: "246810" } });
    return { response, managerEmail };
  }
  async function installManager(venueId: string, email = `added-${uid()}@example.com`, headers: Record<string, string> = INSTALLER) {
    return call("POST", `/installer/venues/${venueId}/managers`, { headers, body: { name: "Dawit", email, pin: "135790" } });
  }

  it("the installer creates a café with its first manager, who can use the dashboard", async () => {
    const { response, managerEmail } = await installCafe();
    expect(response.status).toBe(201);
    const body = await json<{ venueId: string; manager: { id: string } }>(response);
    expect(body.manager.id).toEqual(expect.any(String));

    const me = await json<{ user: { role: string; name: string } }>(await admin("GET", "/admin/api/me", managerEmail));
    expect(me.user).toMatchObject({ role: "manager", name: "Meron" });
  });

  it("the old installer body (ownerName/ownerEmail/ownerPin) is refused; no café is created", async () => {
    const ownerEmail = `old-${uid()}@example.com`;
    const response = await call("POST", "/installer/venues", { headers: INSTALLER, body: { name: "X", ownerName: "A", ownerEmail, ownerPin: "123456" } });
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "INVALID_REQUEST" });
    expect((await admin("GET", "/admin/api/me", ownerEmail)).status).toBe(403); // nobody registered
  });

  it("the installer adds a manager to an existing café; a wrong secret or unknown café is refused", async () => {
    const { response } = await installCafe();
    const { venueId } = await json<{ venueId: string }>(response);
    const email = `added-${uid()}@example.com`;

    const added = await installManager(venueId, email);
    expect(added.status).toBe(201);
    expect((await json<{ manager: { id: string } }>(added)).manager.id).toEqual(expect.any(String));
    expect((await json<{ user: { role: string } }>(await admin("GET", "/admin/api/me", email))).user.role).toBe("manager");

    expect((await installManager(venueId, undefined, { ...INSTALLER, Authorization: "Bearer wrong" })).status).toBe(401);
    const unknown = await installManager("v-doesnotexist00");
    expect(unknown.status).toBe(404);
    expect(await json(unknown)).toEqual({ error: "NOT_FOUND" });
  });

  it("a manager creates waiters only: role manager is forbidden, role owner is invalid", async () => {
    const { response, managerEmail } = await installCafe();
    expect(response.status).toBe(201);

    const manager = await admin("POST", "/admin/api/staff", managerEmail, { name: "Dawit", role: "manager", pin: "111111" });
    expect(manager.status).toBe(403);
    expect(await json(manager)).toEqual({ error: "FORBIDDEN" });
    const owner = await admin("POST", "/admin/api/staff", managerEmail, { name: "Boss", role: "owner", pin: "222222" });
    expect(owner.status).toBe(400);
    expect(await json(owner)).toEqual({ error: "INVALID_INPUT" });
    expect((await admin("POST", "/admin/api/staff", managerEmail, { name: "Hana", role: "waiter", pin: "1234" })).status).toBe(201);
  });

  it("the installer refuses a 4-digit manager PIN (managers need 6, D-11)", async () => {
    const { response } = await installCafe();
    const { venueId } = await json<{ venueId: string }>(response);
    const refused = await call("POST", `/installer/venues/${venueId}/managers`, { headers: INSTALLER, body: { name: "Dawit", email: `short-${uid()}@example.com`, pin: "1234" } });
    expect(refused.status).toBe(400);
    expect(await json(refused)).toEqual({ error: "INVALID_PIN" });
  });

  it("a manager cannot deactivate or reset the PIN of another manager", async () => {
    const { response, managerEmail } = await installCafe();
    const { venueId } = await json<{ venueId: string }>(response);
    const other = await json<{ manager: { id: string } }>(await installManager(venueId));

    expect((await admin("POST", `/admin/api/staff/${other.manager.id}/deactivate`, managerEmail, {})).status).toBe(403);
    expect((await admin("POST", `/admin/api/staff/${other.manager.id}/pin`, managerEmail, { pin: "111111" })).status).toBe(403);
  });
});
