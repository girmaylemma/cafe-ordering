/**
 * F4b: the café's language (manager's default) and each person's own choice (design 5.2).
 * A waiter sets their own over the WebSocket; /staff and sign-in tell the tablet both.
 */
import { describe, expect, it } from "vitest";
import { CAFE_MIGRATIONS } from "../src/cafe/migrations";
import { call, json, newCafe as newAdminCafe } from "./adminHelpers";
import { connect, ensureStaff, newCafe, signedInWaiter, sql, staffHeaders, stationHeaders, TEST_PIN, VENUE } from "./helpers";

let counter = 0;
const key = () => `lang-key-${++counter}`;
const setLanguage = (language: unknown) => ({ type: "staff.language", idempotencyKey: key(), language });

async function staffList(cafe: ReturnType<typeof newCafe>) {
  const tablet = await signedInWaiter(cafe, "reader");
  const result = await cafe.listStaff(tablet.token);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("languages (F4b)", () => {
  it("a new café speaks English and nobody has chosen", async () => {
    const cafe = newCafe();
    await ensureStaff(cafe, "hana");

    const result = await staffList(cafe);

    expect(result.language).toBe("en");
    expect(result.staff.every((s) => s.language === null)).toBe(true);
  });

  it("the café's own language is returned", async () => {
    const cafe = newCafe();
    await sql(cafe, "INSERT INTO venue (id, name, created_at, lang) VALUES (?, 'Abebe Cafe', 0, 'am')", VENUE);

    expect((await staffList(cafe)).language).toBe("am");
  });

  it.each([["om"], ["ti"]])("F4e: a café can speak %s", async (language) => {
    const cafe = newCafe();
    await sql(cafe, "INSERT INTO venue (id, name, created_at, lang) VALUES (?, 'Abebe Cafe', 0, ?)", VENUE, language);

    expect((await staffList(cafe)).language).toBe(language);
  });

  it.each([["om"], ["ti"]])("F4e: a waiter can choose %s, and sign-in returns it", async (language) => {
    const cafe = newCafe();
    const hana = await connect(cafe, staffHeaders("hana"));

    hana.send(setLanguage(language));

    expect((await hana.ack()).result).toEqual({ ok: true, language });
    expect((await staffList(cafe)).staff.find((s) => s.id === "hana")?.language).toBe(language);
    const tablet = await signedInWaiter(cafe, "hana");
    const again = await cafe.signIn({ deviceToken: tablet.token, userId: "hana", pin: TEST_PIN });
    expect(again.ok && again.user.language).toBe(language);
  });

  it("F4e: the database itself still refuses an unknown language (a bug cannot store one)", async () => {
    const cafe = newCafe();
    await ensureStaff(cafe, "hana");

    await expect(sql(cafe, "UPDATE staff SET lang = 'fr'")).rejects.toThrow(/CHECK/);
    await expect(sql(cafe, "INSERT INTO venue (id, name, created_at, lang) VALUES (?, 'X', 0, 'fr')", VENUE)).rejects.toThrow(/CHECK/);
  });

  it("F4e: migration 7 carries over the F4b choices (old column -> new column)", async () => {
    const cafe = newCafe();
    await ensureStaff(cafe, "hana");
    await ensureStaff(cafe, "abel");
    // As a café upgraded from F4b holds them: chosen in the old columns, new ones at their defaults.
    await sql(cafe, "INSERT INTO venue (id, name, created_at, language) VALUES (?, 'Abebe Cafe', 0, 'am')", VENUE);
    await sql(cafe, "UPDATE staff SET language = 'am', lang = NULL WHERE id = 'hana'");

    const copies = CAFE_MIGRATIONS.find((m) => m.version === 7)!.statements.filter((s) => s.startsWith("UPDATE"));
    for (const statement of copies) await sql(cafe, statement);

    expect(await sql(cafe, "SELECT lang FROM venue")).toEqual([{ lang: "am" }]);
    expect(await sql(cafe, "SELECT id, lang FROM staff WHERE id IN ('hana', 'abel') ORDER BY id")).toEqual([
      { id: "abel", lang: null },
      { id: "hana", lang: "am" },
    ]);
  });

  it("a waiter sets their own language over the WebSocket, and sign-in returns it", async () => {
    const cafe = newCafe();
    const hana = await connect(cafe, staffHeaders("hana"));

    hana.send(setLanguage("am"));

    expect((await hana.ack()).result).toEqual({ ok: true, language: "am" });
    expect((await staffList(cafe)).staff.find((s) => s.id === "hana")?.language).toBe("am");
    const tablet = await signedInWaiter(cafe, "hana");
    const again = await cafe.signIn({ deviceToken: tablet.token, userId: "hana", pin: TEST_PIN });
    expect(again.ok && again.user.language).toBe("am");
  });

  it("null goes back to the café's language", async () => {
    const cafe = newCafe();
    const hana = await connect(cafe, staffHeaders("hana"));
    hana.send(setLanguage("am"));
    await hana.ack();

    hana.send(setLanguage(null));

    expect((await hana.ack()).result).toEqual({ ok: true, language: null });
    expect((await staffList(cafe)).staff.find((s) => s.id === "hana")?.language).toBeNull();
  });

  it("the same key twice: one change, two identical acks", async () => {
    const cafe = newCafe();
    const hana = await connect(cafe, staffHeaders("hana"));
    const message = setLanguage("am");

    hana.send(message);
    hana.send(message);
    const acks = (await hana.drain()).filter((m) => m.type === "ack");

    expect(acks).toHaveLength(2);
    expect(acks[1]).toEqual(acks[0]);
  });

  it("only the sender's own language changes", async () => {
    const cafe = newCafe();
    await ensureStaff(cafe, "abel");
    const hana = await connect(cafe, staffHeaders("hana"));

    hana.send(setLanguage("am"));
    await hana.ack();

    expect((await staffList(cafe)).staff.find((s) => s.id === "abel")?.language).toBeNull();
  });

  it("a kitchen tablet cannot set a language", async () => {
    const cafe = newCafe();
    const kitchen = await connect(cafe, stationHeaders("kitchen"));

    kitchen.send(setLanguage("am"));

    expect(await kitchen.next()).toEqual({ type: "error", error: "NOT_ALLOWED_FOR_CONNECTION" });
    expect(await sql(cafe, "SELECT 1 FROM staff WHERE language IS NOT NULL")).toEqual([]);
  });

  it.each([["fr"], [""], [5], [undefined]])("an unknown language (%s) is refused", async (language) => {
    const cafe = newCafe();
    const hana = await connect(cafe, staffHeaders("hana"));

    hana.send({ type: "staff.language", idempotencyKey: key(), ...(language === undefined ? {} : { language }) });

    expect(await hana.next()).toEqual({ type: "error", error: "INVALID_MESSAGE" });
    expect(await sql(cafe, "SELECT 1 FROM staff WHERE language IS NOT NULL")).toEqual([]);
  });

  it("the public /staff route returns the café language", async () => {
    const { managerEmail } = await newAdminCafe();
    const token = await pairedWaiterTablet(managerEmail);

    const response = await call("GET", "/staff", { headers: { Authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ language: "en", staff: [expect.objectContaining({ language: null })] });
  });
});

/** A waiter tablet paired through the real routes (dashboard code, then POST /devices/pair). */
async function pairedWaiterTablet(email: string) {
  const { admin } = await import("./adminHelpers");
  const created = await json<{ pairingCode: { code: string } }>(await admin("POST", "/admin/api/devices", email, { name: "Phone", kind: "waiter" }));
  const paired = await call("POST", "/devices/pair", {
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.32.${counter % 250}.${Math.floor(Math.random() * 250)}` },
    body: { code: created.pairingCode.code },
  });
  return (await json<{ token: string }>(paired)).token;
}
