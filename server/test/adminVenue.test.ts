/**
 * F4c: the café's language in the dashboard (design spec 5.2/5.3). A manager or owner reads and
 * changes it; tablets pick it up at their next /staff download (no live push). The staff list
 * shows each person's own choice (read-only: staff choose it themselves on the tablet).
 */
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { admin, cafeWithManager, call, json, newCafe, uid } from "./adminHelpers";

/** A waiter tablet paired through the real routes (dashboard code, then POST /devices/pair). */
async function pairedWaiterTablet(email: string) {
  const created = await json<{ pairingCode: { code: string } }>(await admin("POST", "/admin/api/devices", email, { name: "Phone", kind: "waiter" }));
  const paired = await call("POST", "/devices/pair", {
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.33.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    body: { code: created.pairingCode.code },
  });
  return (await json<{ token: string }>(paired)).token;
}

const cafeDo = (venueId: string) => env.CAFE.get(env.CAFE.idFromName(venueId));

describe("the café language in the dashboard (F4c)", () => {
  it("GET /venue: a new café speaks English", async () => {
    const { ownerEmail, venueId } = await newCafe();

    const response = await admin("GET", "/admin/api/venue", ownerEmail);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ venue: { id: venueId, name: "Abebe Cafe", language: "en" } });
  });

  it("the owner sets Tigrinya: a tablet's next download says so, and the change is audited", async () => {
    const { ownerEmail, owner, venueId } = await newCafe();
    const tablet = await pairedWaiterTablet(ownerEmail);

    const saved = await admin("PATCH", "/admin/api/venue", ownerEmail, { language: "ti" });

    expect(saved.status).toBe(200);
    expect(await json(saved)).toEqual({ venue: { id: venueId, name: "Abebe Cafe", language: "ti" } });
    const download = await call("GET", "/staff", { headers: { Authorization: `Bearer ${tablet}` } });
    expect(await json(download)).toMatchObject({ language: "ti" });
    expect(await cafeDo(venueId).auditLog(10)).toContainEqual(
      expect.objectContaining({ type: "venue.language_changed", actor: { kind: "staff", userId: owner.id } }),
    );
  });

  it("a manager may change it too", async () => {
    const { managerEmail } = await cafeWithManager();

    const saved = await admin("PATCH", "/admin/api/venue", managerEmail, { language: "am" });

    expect(saved.status).toBe(200);
    expect((await json<{ venue: { language: string } }>(await admin("GET", "/admin/api/venue", managerEmail))).venue.language).toBe("am");
  });

  it("a waiter cannot (no dashboard role)", async () => {
    const { ownerEmail } = await newCafe();
    const waiterEmail = `waiter-${uid()}@example.com`;
    await admin("POST", "/admin/api/staff", ownerEmail, { name: "Hana", role: "waiter", pin: "1234", email: waiterEmail });

    expect((await admin("PATCH", "/admin/api/venue", waiterEmail, { language: "am" })).status).toBe(403);
    expect((await admin("GET", "/admin/api/venue", waiterEmail)).status).toBe(403);
  });

  it.each([["fr"], [null], [5], [undefined]])("an unknown language (%s) is refused and nothing changes", async (language) => {
    const { ownerEmail } = await newCafe();

    const response = await admin("PATCH", "/admin/api/venue", ownerEmail, language === undefined ? {} : { language });

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "INVALID_INPUT" });
    expect((await json<{ venue: { language: string } }>(await admin("GET", "/admin/api/venue", ownerEmail))).venue.language).toBe("en");
  });

  it("a change that is not JSON is refused (cross-site protection, like every dashboard write)", async () => {
    const { ownerEmail } = await newCafe();

    const response = await admin("PATCH", "/admin/api/venue", ownerEmail, "language=am", { "Content-Type": "application/x-www-form-urlencoded" });

    expect(response.status).toBe(415);
  });

  it("a café without a venue row (made before the installer): an error, never a silent OK", async () => {
    const { ownerEmail, venueId } = await newCafe();
    await runInDurableObject(cafeDo(venueId), (_instance, state) => state.storage.sql.exec("DELETE FROM venue"));

    const response = await admin("PATCH", "/admin/api/venue", ownerEmail, { language: "am" });

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "NOT_FOUND" });
  });

  it("the staff list shows each person's own language (null = follows the café)", async () => {
    const { ownerEmail, owner, venueId } = await newCafe();
    await runInDurableObject(cafeDo(venueId), (_instance, state) => state.storage.sql.exec("UPDATE staff SET lang = 'om' WHERE id = ?", owner.id));
    await admin("POST", "/admin/api/staff", ownerEmail, { name: "Hana", role: "waiter", pin: "1234" });

    const list = await json<{ staff: Array<{ name: string; language: string | null }> }>(await admin("GET", "/admin/api/staff", ownerEmail));

    expect(list.staff.map((s) => [s.name, s.language])).toEqual([
      ["Abebe", "om"],
      ["Hana", null],
    ]);
  });
});
