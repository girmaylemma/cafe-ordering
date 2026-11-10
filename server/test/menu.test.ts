/** Menu and tables in the dashboard (D1b), tablet downloads (GET /menu, GET /tables), two-language tickets. */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { admin, cafeWithManager, call, counter, json, newCafe } from "./adminHelpers";
import { connect, newCafe as newDoCafe, seedMenu, seedTables, sql, staffHeaders } from "./helpers";

type Category = { id: string; nameEn: string; nameAm: string | null; sortOrder: number; active: boolean };
type Item = {
  id: string;
  categoryId: string | null;
  nameEn: string;
  nameAm: string | null;
  price: string;
  priceSantim: number;
  stationId: string;
  fasting: boolean;
  soldOut: boolean;
  sortOrder: number;
  active: boolean;
};

async function newCategory(email: string, nameEn = "Food", extra: Record<string, unknown> = {}) {
  const response = await admin("POST", "/admin/api/categories", email, { nameEn, ...extra });
  expect(response.status).toBe(201);
  return (await json<{ category: Category }>(response)).category;
}

async function newItem(email: string, categoryId: string, extra: Record<string, unknown> = {}) {
  const response = await admin("POST", "/admin/api/menu-items", email, {
    categoryId,
    nameEn: "Shiro",
    nameAm: "ሽሮ",
    price: "180",
    stationId: "kitchen",
    ...extra,
  });
  expect(response.status).toBe(201);
  return (await json<{ item: Item }>(response)).item;
}

/** A paired waiter tablet in the café, through the real pairing flow. */
async function tabletToken(email: string) {
  const created = await json<{ pairingCode: { code: string } }>(
    await admin("POST", "/admin/api/devices", email, { name: "Tab", kind: "waiter", stationId: null }),
  );
  const paired = await call("POST", "/devices/pair", {
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.20.${counter % 250}.${Math.floor(Math.random() * 250)}` },
    body: { code: created.pairingCode.code },
  });
  return (await json<{ token: string }>(paired)).token;
}

// ---------- categories ----------
describe("categories", () => {
  it("English name is required, Amharic optional (D-67); the change is audited", async () => {
    const { ownerEmail, venueId } = await newCafe();

    const category = await newCategory(ownerEmail, "Hot drinks");

    expect(category).toMatchObject({ nameEn: "Hot drinks", nameAm: null, sortOrder: 0, active: true });
    const list = await json<{ categories: Category[] }>(await admin("GET", "/admin/api/categories", ownerEmail));
    expect(list.categories.map((c) => c.nameEn)).toEqual(["Hot drinks"]);
    const log = await env.CAFE.get(env.CAFE.idFromName(venueId)).auditLog(5);
    expect(log.map((e) => e.type)).toContain("category.created");
  });

  it.each([
    ["no English name", { nameAm: "መጠጥ" }],
    ["an empty English name", { nameEn: "  " }],
    ["a 61-character name", { nameEn: "x".repeat(61) }],
    ["a negative sort order", { nameEn: "A", sortOrder: -1 }],
  ])("refuses %s with 400", async (_label, body) => {
    const { ownerEmail } = await newCafe();
    expect((await admin("POST", "/admin/api/categories", ownerEmail, body)).status).toBe(400);
  });

  it("can be renamed, reordered and deactivated (never deleted)", async () => {
    const { ownerEmail } = await newCafe();
    const category = await newCategory(ownerEmail);

    const patched = await admin("PATCH", `/admin/api/categories/${category.id}`, ownerEmail, { nameAm: "ምግብ", sortOrder: 3, active: false });

    expect(patched.status).toBe(200);
    expect((await json<{ category: Category }>(patched)).category).toMatchObject({ nameEn: "Food", nameAm: "ምግብ", sortOrder: 3, active: false });
  });

  it("a manager can edit the menu too", async () => {
    const { managerEmail } = await cafeWithManager();
    await newCategory(managerEmail);
  });

  it("a deactivated manager can no longer read or change the menu or tables (403)", async () => {
    const { ownerEmail, managerEmail, managerId } = await cafeWithManager();
    const category = await newCategory(ownerEmail);
    await admin("POST", `/admin/api/staff/${managerId}/deactivate`, ownerEmail, {});

    const attempts = [
      admin("GET", "/admin/api/categories", managerEmail),
      admin("POST", "/admin/api/categories", managerEmail, { nameEn: "Sneaky" }),
      admin("PATCH", `/admin/api/categories/${category.id}`, managerEmail, { active: false }),
      admin("POST", "/admin/api/menu-items", managerEmail, { categoryId: category.id, nameEn: "X", price: "1", stationId: "bar" }),
      admin("POST", "/admin/api/tables", managerEmail, { name: "T9" }),
    ];
    for (const response of await Promise.all(attempts)) expect(response.status).toBe(403);
    const list = await json<{ categories: Category[] }>(await admin("GET", "/admin/api/categories", ownerEmail));
    expect(list.categories).toEqual([category]); // nothing changed
  });
});

// ---------- menu items ----------
describe("menu items", () => {
  it("stores the price in santim and shows it back in ETB; station, fasting and both names are kept", async () => {
    const { ownerEmail } = await newCafe();
    const drinks = await newCategory(ownerEmail, "Drinks");

    const item = await newItem(ownerEmail, drinks.id, { nameEn: "Macchiato", nameAm: null, price: "42.50", stationId: "bar", fasting: true });

    expect(item).toMatchObject({ nameEn: "Macchiato", nameAm: null, price: "42.50", priceSantim: 4250, stationId: "bar", fasting: true, soldOut: false, active: true });
  });

  it.each([
    ["three decimals", { price: "1.005" }],
    ["a negative price", { price: "-1" }],
    ["a price as a number (floats can't be trusted with money)", { price: 42.5 }],
    ["text as a price", { price: "abc" }],
    ["a station that doesn't exist (only kitchen and bar, D-68)", { stationId: "grill" }],
    ["no English name", { nameEn: undefined }],
    ["fasting as a string", { fasting: "yes" }],
  ])("refuses %s with 400", async (_label, extra) => {
    const { ownerEmail } = await newCafe();
    const category = await newCategory(ownerEmail);
    const body: Record<string, unknown> = { categoryId: category.id, nameEn: "Shiro", price: "180", stationId: "kitchen", ...extra };
    expect((await admin("POST", "/admin/api/menu-items", ownerEmail, body)).status).toBe(400);
  });

  it("refuses a category from another café, or one that doesn't exist", async () => {
    const a = await newCafe();
    const b = await newCafe();
    const theirs = await newCategory(b.ownerEmail);
    for (const categoryId of [theirs.id, "no-such-category"]) {
      const body = { categoryId, nameEn: "Shiro", price: "180", stationId: "kitchen" };
      expect((await admin("POST", "/admin/api/menu-items", a.ownerEmail, body)).status).toBe(400);
    }
  });

  it("can change price, names and station, and be deactivated", async () => {
    const { ownerEmail } = await newCafe();
    const category = await newCategory(ownerEmail);
    const item = await newItem(ownerEmail, category.id);

    const patched = await admin("PATCH", `/admin/api/menu-items/${item.id}`, ownerEmail, { price: "200.00", nameEn: "Shiro wot", stationId: "bar", active: false });

    expect((await json<{ item: Item }>(patched)).item).toMatchObject({ priceSantim: 20000, price: "200.00", nameEn: "Shiro wot", stationId: "bar", active: false });
  });

  it("an item of another café is not found (404)", async () => {
    const a = await newCafe();
    const b = await newCafe();
    const theirs = await newItem(b.ownerEmail, (await newCategory(b.ownerEmail)).id);
    expect((await admin("PATCH", `/admin/api/menu-items/${theirs.id}`, a.ownerEmail, { price: "1" })).status).toBe(404);
  });
});

// ---------- tables ----------
describe("tables", () => {
  it("are created, listed and edited", async () => {
    const { ownerEmail } = await newCafe();
    const created = await admin("POST", "/admin/api/tables", ownerEmail, { name: "Table 7", area: "Terrace", seats: 4 });
    expect(created.status).toBe(201);
    const { table } = await json<{ table: { id: string } }>(created);

    await admin("PATCH", `/admin/api/tables/${table.id}`, ownerEmail, { seats: 6 });

    const list = await json<{ tables: unknown[] }>(await admin("GET", "/admin/api/tables", ownerEmail));
    expect(list.tables).toEqual([{ id: table.id, name: "Table 7", area: "Terrace", seats: 6, sortOrder: 0, active: true }]);
  });

  it.each([
    ["no name", { area: "Inside" }],
    ["0 seats", { name: "T1", seats: 0 }],
    ["100 seats", { name: "T1", seats: 100 }],
  ])("refuses %s with 400", async (_label, body) => {
    const { ownerEmail } = await newCafe();
    expect((await admin("POST", "/admin/api/tables", ownerEmail, body)).status).toBe(400);
  });

  it("a table with guests at it can't be deactivated (409)", async () => {
    const { ownerEmail, venueId } = await newCafe();
    const { table } = await json<{ table: { id: string } }>(await admin("POST", "/admin/api/tables", ownerEmail, { name: "Table 7" }));
    await runInDurableObject(env.CAFE.get(env.CAFE.idFromName(venueId)), (_i, state) => {
      state.storage.sql.exec(
        "INSERT INTO table_sessions (id, venue_id, table_id, waiter_id, status, opened_at) VALUES ('s1', ?, ?, 'hana', 'open', 0)",
        venueId,
        table.id,
      );
    });

    const response = await admin("PATCH", `/admin/api/tables/${table.id}`, ownerEmail, { active: false });
    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ error: "TABLE_IN_USE" });
  });
});

// ---------- tablet downloads ----------
describe("GET /menu and GET /tables (tablets)", () => {
  it("the menu has only active categories and items, both names, and no internal fields", async () => {
    const { ownerEmail } = await newCafe();
    const food = await newCategory(ownerEmail, "Food", { nameAm: "ምግብ", sortOrder: 1 });
    const hidden = await newCategory(ownerEmail, "Hidden");
    const shiro = await newItem(ownerEmail, food.id);
    const removed = await newItem(ownerEmail, food.id, { nameEn: "Old dish" });
    await newItem(ownerEmail, hidden.id, { nameEn: "In a hidden category" });
    await admin("PATCH", `/admin/api/menu-items/${removed.id}`, ownerEmail, { active: false });
    await admin("PATCH", `/admin/api/categories/${hidden.id}`, ownerEmail, { active: false });
    const token = await tabletToken(ownerEmail);

    const response = await call("GET", "/menu", { headers: { Authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      categories: [{ id: food.id, nameEn: "Food", nameAm: "ምግብ", sortOrder: 1 }],
      items: [
        { id: shiro.id, categoryId: food.id, nameEn: "Shiro", nameAm: "ሽሮ", priceSantim: 18000, stationId: "kitchen", fasting: false, soldOut: false, sortOrder: 0 },
      ],
    });
  });

  it("tables show whether they are free or open, and who holds them", async () => {
    const { ownerEmail, venueId } = await newCafe();
    const t7 = (await json<{ table: { id: string } }>(await admin("POST", "/admin/api/tables", ownerEmail, { name: "Table 7", seats: 4 }))).table;
    const t8 = (await json<{ table: { id: string } }>(await admin("POST", "/admin/api/tables", ownerEmail, { name: "Table 8" }))).table;
    await runInDurableObject(env.CAFE.get(env.CAFE.idFromName(venueId)), (_i, state) => {
      state.storage.sql.exec(
        "INSERT INTO table_sessions (id, venue_id, table_id, waiter_id, status, opened_at) VALUES ('s1', ?, ?, 'hana', 'open', 0)",
        venueId,
        t7.id,
      );
    });
    const token = await tabletToken(ownerEmail);

    const response = await call("GET", "/tables", { headers: { Authorization: `Bearer ${token}` } });

    expect(await json(response)).toEqual({
      tables: [
        { id: t7.id, name: "Table 7", area: null, seats: 4, sortOrder: 0, state: "open", sessionId: "s1", waiterId: "hana" },
        { id: t8.id, name: "Table 8", area: null, seats: null, sortOrder: 0, state: "free", sessionId: null, waiterId: null },
      ],
    });
  });

  it("both need a paired tablet (401 without a token)", async () => {
    expect((await call("GET", "/menu")).status).toBe(401);
    expect((await call("GET", "/tables")).status).toBe(401);
  });
});

// ---------- two-language tickets (D-69) ----------
describe("orders keep both names", () => {
  it("a sent round copies the English and Amharic names onto the order and the ticket", async () => {
    const cafe = newDoCafe();
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
      items: [
        { id: "oi1", menuItemId: "menu-shiro", qty: 1, note: null },
        { id: "oi2", menuItemId: "menu-macchiato", qty: 1, note: null },
      ],
    });
    const ack = await hana.ack();

    expect(ack.result).toMatchObject({ ok: true, items: [{ name: "Shiro", nameAm: "ሽሮ" }, { name: "Macchiato", nameAm: null }] });
    expect(await sql(cafe, "SELECT name, name_am FROM order_items ORDER BY id")).toEqual([
      { name: "Shiro", name_am: "ሽሮ" },
      { name: "Macchiato", name_am: null },
    ]);
    const [ticket] = await sql<{ details: string }>(cafe, "SELECT details FROM order_events WHERE type = 'item.sent' ORDER BY seq LIMIT 1");
    expect(JSON.parse(ticket!.details)).toMatchObject({ name: "Shiro", nameAm: "ሽሮ" });
  });
});
