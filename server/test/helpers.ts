/** Shared test helpers: a fresh café, seeded data, and test tablets connected over WebSocket. */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ServerMessage } from "../src/cafe/protocol";

export const VENUE = "venue-abebe";

/** A fresh café Durable Object per test, so tests never share data. */
export function newCafe() {
  return env.CAFE.get(env.CAFE.idFromName(crypto.randomUUID()));
}
export type Cafe = ReturnType<typeof newCafe>;

/** Run SQL straight against the café's database. */
export async function sql<T extends Record<string, SqlStorageValue>>(
  cafe: Cafe,
  query: string,
  ...bindings: SqlStorageValue[]
): Promise<T[]> {
  return runInDurableObject(cafe, (_instance, state) => state.storage.sql.exec<T>(query, ...bindings).toArray());
}

/** An item without an order or session (used by the item-command tests). */
export async function seedItem(cafe: Cafe, id = "item-1", stationId = "kitchen") {
  await sql(
    cafe,
    `INSERT INTO order_items (id, venue_id, order_id, menu_item_id, station_id, name, price_santim, qty, state)
     VALUES (?, ?, 'order-1', 'menu-shiro', ?, 'Shiro', 18000, 1, 'sent')`,
    id,
    VENUE,
    stationId,
  );
}

/** A small menu: two normal items, one sold out, one removed from the menu. */
export async function seedMenu(cafe: Cafe) {
  const items: Array<[string, string, number, string, number, number]> = [
    ["menu-shiro", "Shiro", 18000, "kitchen", 0, 1],
    ["menu-macchiato", "Macchiato", 4000, "bar", 0, 1],
    ["menu-tibs", "Tibs", 32000, "kitchen", 1, 1], // sold out
    ["menu-old", "Old dish", 9000, "kitchen", 0, 0], // removed from the menu
  ];
  for (const [id, name, price, station, soldOut, active] of items) {
    await sql(
      cafe,
      `INSERT INTO menu_items (id, venue_id, name, price_santim, station_id, sold_out, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      VENUE,
      name,
      price,
      station,
      soldOut,
      active,
    );
  }
}

export async function seedTables(cafe: Cafe) {
  for (const [id, name] of [
    ["table-7", "Table 7"],
    ["table-8", "Table 8"],
  ]) {
    await sql(cafe, "INSERT INTO tables (id, venue_id, name, active) VALUES (?, ?, ?, 1)", id!, VENUE, name!);
  }
}

export const stationHeaders = (stationId: string, deviceId = `dev-${stationId}`) => ({
  "X-Cafe-Venue": VENUE,
  "X-Cafe-Role": "station",
  "X-Cafe-Device": deviceId,
  "X-Cafe-Station": stationId,
});
export const staffHeaders = (userId: string) => ({
  "X-Cafe-Venue": VENUE,
  "X-Cafe-Role": "staff",
  "X-Cafe-Device": `dev-${userId}`,
  "X-Cafe-User": userId,
});
export const liveHeaders = { "X-Cafe-Venue": VENUE, "X-Cafe-Role": "live", "X-Cafe-User": "owner-1" };

/** A test tablet: an open WebSocket plus a queue of the messages it received. */
export async function connect(cafe: Cafe, headers: Record<string, string>) {
  const response = await cafe.fetch("https://cafe/ws", { headers: { Upgrade: "websocket", ...headers } });
  const ws = response.webSocket;
  if (ws === null) throw new Error(`expected a WebSocket, got HTTP ${response.status}`);
  ws.accept();

  const inbox: ServerMessage[] = [];
  const waiting: Array<(message: ServerMessage) => void> = [];
  ws.addEventListener("message", (e) => {
    const message = JSON.parse(e.data as string) as ServerMessage;
    const resolve = waiting.shift();
    if (resolve) resolve(message);
    else inbox.push(message);
  });

  const tablet = {
    send: (message: unknown) => ws.send(typeof message === "string" ? message : JSON.stringify(message)),
    /** The next message this tablet receives (fails after 2 s). */
    next: () =>
      new Promise<ServerMessage>((resolve, reject) => {
        const queued = inbox.shift();
        if (queued) return resolve(queued);
        const timer = setTimeout(() => reject(new Error("no message within 2 s")), 2000);
        waiting.push((m) => {
          clearTimeout(timer);
          resolve(m);
        });
      }),
    /** The next ack, skipping pushes that arrive before it. */
    async ack(): Promise<Extract<ServerMessage, { type: "ack" }>> {
      for (;;) {
        const message = await tablet.next();
        if (message.type === "ack") return message;
      }
    },
    /**
     * Everything received so far. The DO handles one message at a time and a socket delivers
     * in order, so once this tablet gets the answer to its own sync, any push sent to it
     * earlier has already arrived.
     */
    async drain(): Promise<ServerMessage[]> {
      ws.send(JSON.stringify({ type: "sync", since: Number.MAX_SAFE_INTEGER }));
      const received: ServerMessage[] = [];
      for (;;) {
        const message = await tablet.next();
        if (message.type === "sync.result") return received;
        received.push(message);
      }
    },
    close: () => ws.close(),
  };
  return tablet;
}
