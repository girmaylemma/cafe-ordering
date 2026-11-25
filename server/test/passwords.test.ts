/**
 * M1b (design 5.1, password half): managers have a password for the app's management screens
 * (used from M2). Keyed hash like PINs (D-99), its own lockout, set or changed by the manager
 * through the dashboard until the developer console exists (M4).
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { admin, call, json, newCafe } from "./adminHelpers";

const cafeDo = (venueId: string) => env.CAFE.get(env.CAFE.idFromName(venueId));
const setPassword = (email: string, body: Record<string, unknown>) => admin("PUT", "/admin/api/me/password", email, body);
const me = async (email: string) => (await json<{ user: { hasPassword: boolean } }>(await admin("GET", "/admin/api/me", email))).user;

/** A café whose first manager already set the password "first-password-1". */
async function withPassword() {
  const cafe = await newCafe();
  expect((await setPassword(cafe.managerEmail, { newPassword: "first-password-1" })).status).toBe(200);
  return cafe;
}

describe("manager passwords (M1b)", () => {
  it("a new manager has no password; the first one needs no current password, and is audited without it", async () => {
    const { managerEmail, venueId, manager } = await newCafe();
    expect((await me(managerEmail)).hasPassword).toBe(false);

    const response = await setPassword(managerEmail, { newPassword: "first-password-1" });

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({}); // like every dashboard write (respond() strips "ok")
    expect((await me(managerEmail)).hasPassword).toBe(true);
    const events = await cafeDo(venueId).auditLog(20);
    expect(events).toContainEqual(expect.objectContaining({ type: "auth.password_set", actor: { kind: "staff", userId: manager.id } }));
    expect(JSON.stringify(events)).not.toContain("first-password-1");
  });

  it("changing needs the right current password", async () => {
    const { managerEmail, venueId } = await withPassword();

    const missing = await setPassword(managerEmail, { newPassword: "second-password-2" });
    expect(missing.status).toBe(403);
    expect(await json(missing)).toEqual({ error: "INVALID_CREDENTIALS" });
    const wrong = await setPassword(managerEmail, { currentPassword: "not-the-password", newPassword: "second-password-2" });
    expect(await json(wrong)).toEqual({ error: "INVALID_CREDENTIALS" });

    const right = await setPassword(managerEmail, { currentPassword: "first-password-1", newPassword: "second-password-2" });
    expect(right.status).toBe(200);
    expect(await cafeDo(venueId).auditLog(20)).toContainEqual(expect.objectContaining({ type: "auth.password_changed" }));
    // the new one is now the current one
    expect((await setPassword(managerEmail, { currentPassword: "first-password-1", newPassword: "third-password-3" })).status).toBe(403);
  });

  it.each([
    ["9 characters", "123456789", "INVALID_PASSWORD"],
    ["129 characters", "x".repeat(129), "INVALID_PASSWORD"],
    ["the same as the current one", "first-password-1", "SAME_PASSWORD"],
  ])("a new password of %s is refused and nothing changes", async (_label, newPassword, error) => {
    const { managerEmail } = await withPassword();

    const response = await setPassword(managerEmail, { currentPassword: "first-password-1", newPassword });

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error });
    expect((await setPassword(managerEmail, { currentPassword: "first-password-1", newPassword: "still-the-first-1" })).status).toBe(200);
  });

  it("letters are counted as characters, not bytes: 10 Amharic-and-digit characters are enough", async () => {
    const { managerEmail } = await newCafe();
    expect((await setPassword(managerEmail, { newPassword: "ሰላምሰላምሰላም1" })).status).toBe(200);
  });

  it("5 wrong current passwords lock the password for 5 minutes, but not the PIN sign-in", async () => {
    const { managerEmail, venueId, manager } = await withPassword();

    for (let i = 0; i < 4; i++) await setPassword(managerEmail, { currentPassword: "wrong-password-0", newPassword: "second-password-2" });
    const fifth = await setPassword(managerEmail, { currentPassword: "wrong-password-0", newPassword: "second-password-2" });
    expect(fifth.status).toBe(423);
    expect(await json(fifth)).toMatchObject({ error: "LOCKED", retryAfterMs: expect.any(Number) });
    const rightButLocked = await setPassword(managerEmail, { currentPassword: "first-password-1", newPassword: "second-password-2" });
    expect(rightButLocked.status).toBe(423);
    expect(await cafeDo(venueId).auditLog(30)).toContainEqual(expect.objectContaining({ type: "auth.password_locked" }));

    // The PIN has its own counter: the manager still signs in on a tablet.
    const created = await json<{ pairingCode: { code: string } }>(await admin("POST", "/admin/api/devices", managerEmail, { name: "Phone", kind: "waiter" }));
    const paired = await json<{ token: string }>(
      await call("POST", "/devices/pair", {
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.55.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
        body: { code: created.pairingCode.code },
      }),
    );
    const signIn = await call("POST", "/auth/pin", {
      headers: { Authorization: `Bearer ${paired.token}`, "Content-Type": "application/json" },
      body: { userId: manager.id, pin: "123456" },
    });
    expect(signIn.status).toBe(200);
  });

  it("a change that is not JSON is refused like every dashboard write", async () => {
    const { managerEmail } = await newCafe();
    const response = await admin("PUT", "/admin/api/me/password", managerEmail, "newPassword=x", { "Content-Type": "application/x-www-form-urlencoded" });
    expect(response.status).toBe(415);
  });
});
