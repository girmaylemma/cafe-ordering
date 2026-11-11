/** Item options and add-ons (W-05, 3b part 2): reusable groups, extra amounts, snapshots, stale queued rounds. */
import { describe, expect, it } from "vitest";
import { parseClientMessage } from "../src/cafe/protocol";
import { admin, json, newCafe as newVenue } from "./adminHelpers";
import { connect, ensureStaff, newCafe, pairDevice, seedMenu, seedTables, sql, staffHeaders } from "./helpers";

let counter = 0;
const uid = (p: string) => `${p}-${++counter}`;

type Group = { id: string; options: Array<{ id: string; nameEn: string }> };

/** A café with "Size" (exactly 1: Small +0, Large +15.00) attached to Macchiato, and "Extras" (0..2) attached too. */
async function setup() {
  const cafe = newCafe();
  await seedMenu(cafe);
  await seedTables(cafe);
  await ensureStaff(cafe, "abebe", "manager");

  const size = await cafe.adminCreateOptionGroup("abebe", { nameEn: "Size", nameAm: "መጠን", minChoices: 1, maxChoices: 1 });
  const extras = await cafe.adminCreateOptionGroup("abebe", { nameEn: "Extras", minChoices: 0, maxChoices: 2 });
  if (!size.ok || !extras.ok) throw new Error("group create failed");
  const small = await cafe.adminCreateOption("abebe", size.group.id, { nameEn: "Small", extra: "0" });
  const large = await cafe.adminCreateOption("abebe", size.group.id, { nameEn: "Large", nameAm: "ትልቅ", extra: "15.00" });
  const honey = await cafe.adminCreateOption("abebe", extras.group.id, { nameEn: "Honey", extra: "5" });
  const cream = await cafe.adminCreateOption("abebe", extras.group.id, { nameEn: "Cream", extra: "7.50" });
  const ginger = await cafe.adminCreateOption("abebe", extras.group.id, { nameEn: "Ginger", extra: "2" });
  if (!small.ok || !large.ok || !honey.ok || !cream.ok || !ginger.ok) throw new Error("option create failed");
  const attached = await cafe.adminUpdateMenuItem("abebe", "menu-macchiato", { optionGroupIds: [size.group.id, extras.group.id] });
  if (!attached.ok) throw new Error(`attach failed: ${attached.error}`);

  const hana = await connect(cafe, staffHeaders("hana"));
  hana.send({ type: "session.open", idempotencyKey: uid("k"), sessionId: "s1", tableId: "table-7", guests: 1 });
  await hana.ack();
  return {
    cafe,
    hana,
    ids: { size: size.group.id, extras: extras.group.id, small: small.option.id, large: large.option.id, honey: honey.option.id, cream: cream.option.id, ginger: ginger.option.id },
  };
}

function round(options: string[], extra: Record<string, unknown> = {}, qty = 1) {
  return {
    type: "order.send",
    orderId: uid("o"),
    sessionId: "s1",
    tableId: "table-7",
    createdAt: Date.now(),
    queuedOffline: false,
    items: [{ id: uid("i"), menuItemId: "menu-macchiato", qty, note: null, options }],
    ...extra,
  };
}

async function send(tablet: Awaited<ReturnType<typeof connect>>, message: unknown) {
  tablet.send(message);
  return (await tablet.ack()).result as Record<string, unknown>;
}

// ---------- live rounds ----------
describe("options on a live round", () => {
  it("adds the extras to the unit price and copies option names (both languages) onto the order and ticket", async () => {
    const { cafe, hana, ids } = await setup();

    const result = await send(hana, round([ids.large, ids.honey], {}, 2));

    expect(result).toMatchObject({
      ok: true,
      items: [{ name: "Macchiato", qty: 2, priceSantim: 4000 + 1500 + 500, optionsChanged: false, options: [{ nameEn: "Large", nameAm: "ትልቅ", extraSantim: 1500 }, { nameEn: "Honey", nameAm: null, extraSantim: 500 }] }],
    });
    const [row] = await sql<{ price_santim: number; options: string; options_changed: number }>(cafe, "SELECT price_santim, options, options_changed FROM order_items");
    expect(row!.price_santim).toBe(6000); // unit price incl. extras; reports multiply by qty
    expect(JSON.parse(row!.options).map((o: { nameEn: string }) => o.nameEn)).toEqual(["Large", "Honey"]);
    const [ticket] = await sql<{ details: string }>(cafe, "SELECT details FROM order_events WHERE type = 'item.sent'");
    expect(JSON.parse(ticket!.details)).toMatchObject({ options: [{ nameEn: "Large", nameAm: "ትልቅ" }, { nameEn: "Honey", nameAm: null }], optionsChanged: false });
  });

  it.each([
    ["a missing required choice (Size)", (i: Ids) => [i.honey]],
    ["too many choices in a group (two sizes)", (i: Ids) => [i.small, i.large]],
    ["too many extras (max 2)", (i: Ids) => [i.small, i.honey, i.cream, i.ginger]],
    ["an option that doesn't exist", (_i: Ids) => ["nope", "nope2"]],
  ])("refuses %s with INVALID_OPTIONS and writes nothing", async (_label, pick) => {
    const { cafe, hana, ids } = await setup();
    expect(await send(hana, round(pick(ids)))).toEqual({ ok: false, error: "INVALID_OPTIONS" });
    expect(await sql(cafe, "SELECT COUNT(*) AS n FROM orders")).toEqual([{ n: 0 }]);
  });

  it("refuses an option of a group that isn't attached to this item", async () => {
    const { hana, ids } = await setup();
    const shiro = { ...round([ids.large]), items: [{ id: uid("i"), menuItemId: "menu-shiro", qty: 1, note: null, options: [ids.large] }] };
    expect(await send(hana, shiro)).toEqual({ ok: false, error: "INVALID_OPTIONS" });
  });

  it("an item without option groups still works with no options (older tablets send none)", async () => {
    const { hana } = await setup();
    const plain = { ...round([]), items: [{ id: uid("i"), menuItemId: "menu-shiro", qty: 1, note: null }] };
    expect(await send(hana, plain)).toMatchObject({ ok: true, items: [{ priceSantim: 18000, options: [] }] });
  });
});

// ---------- queued rounds (D-77) ----------
describe("a queued round whose options changed meanwhile is accepted and flagged", () => {
  it("a removed option is dropped and not charged; the ticket says options changed", async () => {
    const { cafe, hana, ids } = await setup();
    await cafe.adminUpdateOption("abebe", ids.honey, { active: false });

    const result = await send(hana, round([ids.large, ids.honey], { queuedOffline: true }));

    expect(result).toMatchObject({ ok: true, items: [{ priceSantim: 5500, optionsChanged: true, options: [{ nameEn: "Large" }] }] });
    const [ticket] = await sql<{ details: string }>(cafe, "SELECT details FROM order_events WHERE type = 'item.sent'");
    expect(JSON.parse(ticket!.details)).toMatchObject({ optionsChanged: true });
  });

  it("a missing required choice is allowed but flagged", async () => {
    const { hana, ids } = await setup();
    expect(await send(hana, round([ids.honey], { queuedOffline: true }))).toMatchObject({ ok: true, items: [{ optionsChanged: true }] });
  });
});

describe("prices and snapshots", () => {
  it("changing an option's extra later never changes an order already sent", async () => {
    const { cafe, hana, ids } = await setup();
    await send(hana, round([ids.large]));
    await cafe.adminUpdateOption("abebe", ids.large, { extra: "30" });

    expect(await sql(cafe, "SELECT price_santim FROM order_items")).toEqual([{ price_santim: 5500 }]);
  });
});

// ---------- tablet menu ----------
describe("GET /menu with options", () => {
  it("lists active groups with their active options, and each item's group ids in order", async () => {
    const { cafe, ids } = await setup();
    await cafe.adminUpdateOption("abebe", ids.ginger, { active: false });
    const tablet = await pairDevice(cafe, "waiter");

    const menu = await cafe.tabletMenu(tablet.token);

    if (!menu.ok) throw new Error(menu.error);
    expect(menu.items.find((i) => i.id === "menu-macchiato")?.optionGroupIds).toEqual([ids.size, ids.extras]);
    expect(menu.items.find((i) => i.id === "menu-shiro")?.optionGroupIds).toEqual([]);
    const extras = menu.optionGroups.find((g) => g.id === ids.extras);
    expect(extras).toMatchObject({ nameEn: "Extras", minChoices: 0, maxChoices: 2 });
    expect(extras?.options.map((o) => [o.nameEn, o.extraSantim])).toEqual([["Honey", 500], ["Cream", 750]]);
  });
});

// ---------- admin validation ----------
describe("option admin rules", () => {
  async function manager() {
    const cafe = newCafe();
    await seedMenu(cafe);
    await ensureStaff(cafe, "abebe", "manager");
    return cafe;
  }

  it.each([
    ["min above max", { nameEn: "Size", minChoices: 2, maxChoices: 1 }],
    ["max 0", { nameEn: "Size", minChoices: 0, maxChoices: 0 }],
    ["no English name", { minChoices: 0, maxChoices: 1 }],
  ])("refuses a group with %s", async (_label, body) => {
    expect(await (await manager()).adminCreateOptionGroup("abebe", body)).toEqual({ ok: false, error: "INVALID_INPUT" });
  });

  it.each([["1.005"], ["-1"], [15]])("refuses the extra amount %j (ETB text with at most 2 decimals)", async (extra) => {
    const cafe = await manager();
    const group = await cafe.adminCreateOptionGroup("abebe", { nameEn: "Size", minChoices: 0, maxChoices: 1 });
    if (!group.ok) throw new Error("group");
    expect(await cafe.adminCreateOption("abebe", group.group.id, { nameEn: "Large", extra })).toEqual({ ok: false, error: "INVALID_INPUT" });
  });

  it("refuses attaching an unknown group, or the same group twice", async () => {
    const cafe = await manager();
    const group = await cafe.adminCreateOptionGroup("abebe", { nameEn: "Size", minChoices: 0, maxChoices: 1 });
    if (!group.ok) throw new Error("group");
    for (const optionGroupIds of [["nope"], [group.group.id, group.group.id]]) {
      expect(await cafe.adminUpdateMenuItem("abebe", "menu-shiro", { optionGroupIds })).toEqual({ ok: false, error: "INVALID_INPUT" });
    }
  });

  it("the dashboard API routes work end to end (create group, add option, attach)", async () => {
    const { ownerEmail } = await newVenue();
    const category = (await json<{ category: { id: string } }>(await admin("POST", "/admin/api/categories", ownerEmail, { nameEn: "Drinks" }))).category;
    const item = (await json<{ item: { id: string } }>(await admin("POST", "/admin/api/menu-items", ownerEmail, { categoryId: category.id, nameEn: "Tea", price: "20", stationId: "bar" }))).item;

    const created = await admin("POST", "/admin/api/option-groups", ownerEmail, { nameEn: "Sugar", minChoices: 0, maxChoices: 1 });
    expect(created.status).toBe(201);
    const group = (await json<{ group: { id: string } }>(created)).group;
    expect((await admin("POST", `/admin/api/option-groups/${group.id}/options`, ownerEmail, { nameEn: "No sugar", extra: "0" })).status).toBe(201);
    expect((await admin("PATCH", `/admin/api/menu-items/${item.id}`, ownerEmail, { optionGroupIds: [group.id] })).status).toBe(200);

    const list = await json<{ groups: Group[] }>(await admin("GET", "/admin/api/option-groups", ownerEmail));
    expect(list.groups.map((g) => [g.id, g.options.map((o) => o.nameEn)])).toEqual([[group.id, ["No sugar"]]]);
  });
});

// ---------- protocol ----------
describe("order line options in the protocol", () => {
  const line = (options: unknown) =>
    JSON.stringify({ type: "order.send", orderId: "o", sessionId: "s", tableId: "t", createdAt: 1, queuedOffline: false, items: [{ id: "i", menuItemId: "m", qty: 1, note: null, options }] });

  it("accepts a list of option ids, and treats a missing list as none", () => {
    expect(parseClientMessage(line(["a", "b"]))).toMatchObject({ ok: true, message: { items: [{ options: ["a", "b"] }] } });
    const noOptions = JSON.stringify({ type: "order.send", orderId: "o", sessionId: "s", tableId: "t", createdAt: 1, queuedOffline: false, items: [{ id: "i", menuItemId: "m", qty: 1, note: null }] });
    expect(parseClientMessage(noOptions)).toMatchObject({ ok: true, message: { items: [{ options: [] }] } });
  });

  it.each([["not a list", "a"], ["a number in the list", [1]], ["the same option twice", ["a", "a"]], ["more than 20", Array.from({ length: 21 }, (_, i) => `o${i}`)]])(
    "refuses %s",
    (_label, options) => {
      expect(parseClientMessage(line(options))).toEqual({ ok: false, error: "INVALID_MESSAGE" });
    },
  );
});

type Ids = Awaited<ReturnType<typeof setup>>["ids"];
