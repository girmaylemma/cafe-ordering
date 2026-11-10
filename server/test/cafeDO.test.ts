import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ItemCommandInput } from "../src/cafe/CafeDO";
import { SCHEMA } from "../src/cafe/schema";
import type { Actor } from "../src/domain/itemState";

// ---------- helpers ----------
const VENUE = "venue-abebe";
const kitchen: Actor = { kind: "station", stationId: "kitchen", deviceId: "dev-k1" };
const waiter: Actor = { kind: "staff", userId: "hana" };

/** A fresh café Durable Object per test, so tests never share data. */
function newCafe() {
  return env.CAFE.get(env.CAFE.idFromName(crypto.randomUUID()));
}
type Cafe = ReturnType<typeof newCafe>;

/** Put an item straight into the café's database (slice 3 will create items via order.send). */
async function seedItem(cafe: Cafe, id = "item-1", venueId = VENUE) {
  await runInDurableObject(cafe, (_instance, state) => {
    state.storage.sql.exec(
      `INSERT INTO order_items (id, venue_id, order_id, menu_item_id, station_id, name, price_santim, qty, state)
       VALUES (?, ?, 'order-1', 'menu-shiro', 'kitchen', 'Shiro', 18000, 1, 'sent')`,
      id,
      venueId,
    );
  });
}

/** Read rows straight from the café's database. */
async function query<T extends Record<string, SqlStorageValue>>(cafe: Cafe, sql: string): Promise<T[]> {
  return runInDurableObject(cafe, (_instance, state) => state.storage.sql.exec<T>(sql).toArray());
}

const itemState = async (cafe: Cafe) =>
  (await query<{ state: string }>(cafe, "SELECT state FROM order_items WHERE id = 'item-1'"))[0]?.state;
const eventCount = async (cafe: Cafe) =>
  (await query<{ n: number }>(cafe, "SELECT COUNT(*) AS n FROM order_events"))[0]?.n;
const processedCount = async (cafe: Cafe) =>
  (await query<{ n: number }>(cafe, "SELECT COUNT(*) AS n FROM processed_commands"))[0]?.n;

let keyCounter = 0;
function cmd(command: ItemCommandInput["command"], actor: Actor, overrides: Partial<ItemCommandInput> = {}) {
  return {
    venueId: VENUE,
    idempotencyKey: `key-${++keyCounter}`,
    itemId: "item-1",
    command,
    actor,
    ...overrides,
  } satisfies ItemCommandInput;
}

// ---------- happy path ----------
describe("CafeDO.handleItemCommand", () => {
  it("accept saves the new state, one event with seq 1, and the idempotency record", async () => {
    const cafe = newCafe();
    await seedItem(cafe);

    const result = await cafe.handleItemCommand(cmd({ type: "accept" }, kitchen));

    expect(result).toMatchObject({ ok: true, alreadyDone: false, seq: 1, item: { state: "accepted" } });
    expect(await itemState(cafe)).toBe("accepted");
    const events = await query(cafe, "SELECT seq, type, from_state, to_state, order_id FROM order_events");
    expect(events).toEqual([{ seq: 1, type: "item.accepted", from_state: "sent", to_state: "accepted", order_id: "order-1" }]);
    expect(await processedCount(cafe)).toBe(1);
  });

  it("accept then ready gives events with seq 1 and 2, and the item remembers the tap for undo", async () => {
    const cafe = newCafe();
    await seedItem(cafe);

    await cafe.handleItemCommand(cmd({ type: "accept" }, kitchen));
    const ready = await cafe.handleItemCommand(cmd({ type: "ready" }, kitchen));

    expect(ready).toMatchObject({ ok: true, seq: 2, item: { state: "ready", lastTap: { action: "ready" } } });
    const undo = await cafe.handleItemCommand(cmd({ type: "undo" }, kitchen));
    expect(undo).toMatchObject({ ok: true, seq: 3, item: { state: "accepted" } });
  });

  // ---------- idempotency ----------
  it("the same command with the same key twice is applied once and answered the same", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    const accept = cmd({ type: "accept" }, kitchen);

    const first = await cafe.handleItemCommand(accept);
    const second = await cafe.handleItemCommand(accept);

    expect(second).toEqual(first);
    expect(await eventCount(cafe)).toBe(1);
    expect(await processedCount(cafe)).toBe(1);
  });

  it("the same key with a different command is refused and changes nothing", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    await cafe.handleItemCommand(cmd({ type: "accept" }, kitchen, { idempotencyKey: "k" }));

    const reused = await cafe.handleItemCommand(cmd({ type: "ready" }, kitchen, { idempotencyKey: "k" }));

    expect(reused).toEqual({ ok: false, error: "IDEMPOTENCY_KEY_REUSED" });
    expect(await itemState(cafe)).toBe("accepted");
    expect(await eventCount(cafe)).toBe(1);
  });

  // ---------- edge cases ----------
  it("a repeated accept with a new key is reported as already done and adds no event (D-35)", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    await cafe.handleItemCommand(cmd({ type: "accept" }, kitchen));

    const again = await cafe.handleItemCommand(cmd({ type: "accept" }, kitchen));

    expect(again).toMatchObject({ ok: true, alreadyDone: true, seq: null, item: { state: "accepted" } });
    expect(await eventCount(cafe)).toBe(1);
  });

  it("cancel and accept sent at the same moment: exactly one wins (D-07)", async () => {
    const cafe = newCafe();
    await seedItem(cafe);

    const [cancel, accept] = await Promise.all([
      cafe.handleItemCommand(cmd({ type: "cancel" }, waiter)),
      cafe.handleItemCommand(cmd({ type: "accept" }, kitchen)),
    ]);

    const winners = [cancel, accept].filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    if (cancel.ok) {
      expect(accept).toEqual({ ok: false, error: "NOT_ALLOWED_FROM_STATE" });
      expect(await itemState(cafe)).toBe("cancelled");
    } else {
      expect(cancel).toEqual({ ok: false, error: "NEEDS_MANAGER_VOID" });
      expect(await itemState(cafe)).toBe("accepted");
    }
    expect(await eventCount(cafe)).toBe(1);
  });

  // ---------- failure cases ----------
  it("an unknown item is refused and nothing is written, not even the idempotency record", async () => {
    const cafe = newCafe();
    await seedItem(cafe);

    const result = await cafe.handleItemCommand(cmd({ type: "accept" }, kitchen, { itemId: "no-such-item" }));

    expect(result).toEqual({ ok: false, error: "ITEM_NOT_FOUND" });
    expect(await eventCount(cafe)).toBe(0);
    expect(await processedCount(cafe)).toBe(0);
  });

  it("an item from another venue is treated as not found", async () => {
    const cafe = newCafe();
    await seedItem(cafe, "item-1", "venue-other");

    const result = await cafe.handleItemCommand(cmd({ type: "accept" }, kitchen));

    expect(result).toEqual({ ok: false, error: "ITEM_NOT_FOUND" });
  });

  it("a refused command changes nothing, but its refusal is replayed for the same key", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    const earlyReady = cmd({ type: "ready" }, kitchen);

    const refused = await cafe.handleItemCommand(earlyReady);
    expect(refused).toEqual({ ok: false, error: "NOT_ALLOWED_FROM_STATE" });
    expect(await itemState(cafe)).toBe("sent");
    expect(await eventCount(cafe)).toBe(0);

    // The state changes, then the tablet resends the old command: it gets the same answer as before.
    await cafe.handleItemCommand(cmd({ type: "accept" }, kitchen));
    expect(await cafe.handleItemCommand(earlyReady)).toEqual(refused);
    expect(await itemState(cafe)).toBe("accepted");
  });

  it("if saving the event fails, everything is rolled back and the caller gets INTERNAL_ERROR (retry-safe)", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    // Simulate a write failure: remove the events table so the INSERT fails mid-command.
    await runInDurableObject(cafe, (_instance, state) => {
      state.storage.sql.exec("DROP TABLE order_events");
    });
    const accept = cmd({ type: "accept" }, kitchen);

    expect(await cafe.handleItemCommand(accept)).toEqual({ ok: false, error: "INTERNAL_ERROR" });
    expect(await itemState(cafe)).toBe("sent");
    expect(await processedCount(cafe)).toBe(0);

    // Once storage works again, a retry of the same tap (same key) succeeds.
    await runInDurableObject(cafe, (_instance, state) => {
      for (const statement of SCHEMA) state.storage.sql.exec(statement);
    });
    expect(await cafe.handleItemCommand(accept)).toMatchObject({ ok: true, item: { state: "accepted" } });
  });
});
