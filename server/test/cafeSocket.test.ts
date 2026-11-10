import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { VENUE, connect, liveHeaders, newCafe, seedItem, staffHeaders, stationHeaders } from "./helpers";

let keyCounter = 0;
const command = (type: string, itemId = "item-1") => ({
  type: "item.command",
  idempotencyKey: `key-${++keyCounter}`,
  itemId,
  command: { type },
});

// ---------- tests ----------
describe("CafeDO WebSocket", () => {
  it("kitchen sends Accept and gets an ack with ok and seq 1", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    const kitchen = await connect(cafe, stationHeaders("kitchen", "k1"));

    const accept = command("accept");
    kitchen.send(accept);

    expect(await kitchen.next()).toMatchObject({
      type: "ack",
      idempotencyKey: accept.idempotencyKey,
      result: { ok: true, seq: 1, item: { state: "accepted" } },
    });
  });

  it("pushes the event to every tablet of the item's station and to the live view, not to the bar", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    const kitchen1 = await connect(cafe, stationHeaders("kitchen", "k1"));
    const kitchen2 = await connect(cafe, stationHeaders("kitchen", "k2"));
    const bar = await connect(cafe, stationHeaders("bar", "b1"));
    const live = await connect(cafe, liveHeaders);

    kitchen1.send(command("accept"));
    await kitchen1.next(); // ack

    // objectContaining is only partial at its own level, so the nested event needs its own.
    const expected = {
      type: "event",
      event: expect.objectContaining({ seq: 1, itemId: "item-1", stationId: "kitchen", type: "item.accepted", to: "accepted" }),
    };
    expect(await kitchen2.drain()).toEqual([expected]);
    expect(await live.drain()).toEqual([expected]);
    expect(await bar.drain()).toEqual([]);
  });

  it("the same command sent twice gets two identical acks but only one push", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    const kitchen = await connect(cafe, stationHeaders("kitchen", "k1"));
    const live = await connect(cafe, liveHeaders);
    const accept = command("accept");

    kitchen.send(accept);
    kitchen.send(accept);
    const received = await kitchen.drain();

    const acks = received.filter((m) => m.type === "ack");
    expect(acks).toHaveLength(2);
    expect(acks[1]).toEqual(acks[0]);
    expect((await live.drain()).filter((m) => m.type === "event")).toHaveLength(1);
  });

  it("a refused command gets an ack with the error and pushes nothing", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    const kitchen = await connect(cafe, stationHeaders("kitchen", "k1"));
    const waiter = await connect(cafe, staffHeaders("hana"));
    const live = await connect(cafe, liveHeaders);

    kitchen.send(command("accept"));
    await kitchen.next(); // ack
    await live.drain(); // the accept push

    waiter.send(command("cancel"));
    expect(await waiter.next()).toMatchObject({ type: "ack", result: { ok: false, error: "NEEDS_MANAGER_VOID" } });
    expect(await live.drain()).toEqual([]);
  });

  it("uses the connection's identity, not an actor claimed in the message", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    const waiter = await connect(cafe, staffHeaders("hana"));

    waiter.send({ ...command("accept"), actor: { kind: "station", stationId: "kitchen", deviceId: "fake" } });

    expect(await waiter.next()).toMatchObject({ type: "ack", result: { ok: false, error: "WRONG_ACTOR" } });
  });

  it("a live dashboard cannot send commands", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    const live = await connect(cafe, liveHeaders);

    live.send(command("accept"));

    expect(await live.next()).toEqual({ type: "error", error: "NOT_ALLOWED_FOR_CONNECTION" });
  });

  // ---------- reconnect catch-up ----------
  it("sync returns the events after the given seq, in order, filtered to the station", async () => {
    const cafe = newCafe();
    await seedItem(cafe, "item-1", "kitchen");
    await seedItem(cafe, "item-2", "bar");
    const kitchen = await connect(cafe, stationHeaders("kitchen", "k1"));
    const bar = await connect(cafe, stationHeaders("bar", "b1"));

    kitchen.send(command("accept", "item-1")); // seq 1
    await kitchen.next();
    bar.send(command("accept", "item-2")); // seq 2 (bar)
    await bar.next();
    kitchen.send(command("ready", "item-1")); // seq 3
    await kitchen.next();
    await kitchen.drain(); // discard live pushes so far

    // A second kitchen tablet reconnects having seen up to seq 0.
    const reconnected = await connect(cafe, stationHeaders("kitchen", "k2"));
    reconnected.send({ type: "sync", since: 0 });
    const result = await reconnected.next();

    expect(result).toMatchObject({ type: "sync.result", reloadRequired: false });
    if (result.type !== "sync.result") throw new Error("unreachable");
    expect(result.events.map((e) => [e.seq, e.type])).toEqual([
      [1, "item.accepted"],
      [3, "item.ready"],
    ]);
  });

  it("the live view's sync includes every station", async () => {
    const cafe = newCafe();
    await seedItem(cafe, "item-1", "kitchen");
    await seedItem(cafe, "item-2", "bar");
    const kitchen = await connect(cafe, stationHeaders("kitchen", "k1"));
    const bar = await connect(cafe, stationHeaders("bar", "b1"));
    kitchen.send(command("accept", "item-1"));
    await kitchen.next();
    bar.send(command("accept", "item-2"));
    await bar.next();

    const live = await connect(cafe, liveHeaders);
    live.send({ type: "sync", since: 1 });

    expect(await live.next()).toMatchObject({ type: "sync.result", events: [{ seq: 2, stationId: "bar" }] });
  });

  it("asks for a full reload when more than 500 events were missed", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    await runInDurableObject(cafe, (_instance, state) => {
      for (let i = 0; i < 501; i++) {
        state.storage.sql.exec(
          `INSERT INTO order_events (venue_id, order_id, order_item_id, type, from_state, to_state, actor, at)
           VALUES (?, 'order-1', 'item-1', 'item.accepted', 'sent', 'accepted', '{}', 0)`,
          VENUE,
        );
      }
    });
    const kitchen = await connect(cafe, stationHeaders("kitchen", "k1"));

    kitchen.send({ type: "sync", since: 0 });

    expect(await kitchen.next()).toEqual({ type: "sync.result", events: [], reloadRequired: true });
  });

  // ---------- bad input and security ----------
  it("answers bad messages with an error and keeps the connection open", async () => {
    const cafe = newCafe();
    await seedItem(cafe);
    const kitchen = await connect(cafe, stationHeaders("kitchen", "k1"));

    kitchen.send("{not json");
    expect(await kitchen.next()).toEqual({ type: "error", error: "INVALID_MESSAGE" });
    kitchen.send({ type: "sync", since: 0, note: "x".repeat(20_000) });
    expect(await kitchen.next()).toEqual({ type: "error", error: "MESSAGE_TOO_LARGE" });

    // Still works afterwards.
    kitchen.send(command("accept"));
    expect(await kitchen.next()).toMatchObject({ type: "ack", result: { ok: true } });
  });

  it("refuses a WebSocket upgrade without credentials", async () => {
    const cafe = newCafe();
    const response = await cafe.fetch("https://cafe/ws", { headers: { Upgrade: "websocket" } });
    expect(response.status).toBe(401);
    expect(response.webSocket).toBeNull();
  });

  it("no longer trusts station or staff identity headers: only tokens identify tablets", async () => {
    const cafe = newCafe();
    const forged = { "X-Cafe-Venue": VENUE, "X-Cafe-Role": "station", "X-Cafe-Device": "d1", "X-Cafe-Station": "kitchen" };
    const response = await cafe.fetch("https://cafe/ws", { headers: { Upgrade: "websocket", ...forged } });
    expect(response.status).toBe(401);
  });

  it("refuses a plain HTTP request to the café", async () => {
    const cafe = newCafe();
    const response = await cafe.fetch("https://cafe/ws");
    expect(response.status).toBe(426);
  });

  it("the public Worker strips forged X-Cafe-* headers: claiming to be the live view gets 401", async () => {
    const request = new Request("https://api.example/ws", { headers: { Upgrade: "websocket", ...liveHeaders } });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(401);
  });
});
