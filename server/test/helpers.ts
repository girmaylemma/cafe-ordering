/** Shared test helpers: a fresh café, seeded data, and test tablets connected over WebSocket. */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ServerMessage } from "../src/cafe/protocol";

export const VENUE = "venue-abebe";

/** The PIN every test waiter gets. Managers and owners need 6 digits (D-11). */
export const TEST_PIN = "1234";

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
      `INSERT INTO menu_items (id, venue_id, name, name_am, price_santim, station_id, sold_out, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      VENUE,
      name,
      id === "menu-shiro" ? "ሽሮ" : null, // only Shiro has an Amharic name (English is required, D-67)
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

// ---------- credentials ----------

let deviceCounter = 0;

/** Create a device in the café and pair it directly (no pairing code); returns its token. */
export async function pairDevice(cafe: Cafe, kind: "waiter" | "station", stationId: string | null = null) {
  const deviceId = `dev-${kind}-${++deviceCounter}`;
  const created = await cafe.createDevice({ venueId: VENUE, id: deviceId, name: deviceId, kind, stationId });
  if (!created.ok) throw new Error(`createDevice failed: ${created.error}`);
  const paired = await cafe.completePairing(deviceId);
  if (!paired.ok) throw new Error(`completePairing failed: ${paired.error}`);
  return { deviceId, token: paired.token };
}

/** Make sure a staff member exists (waiters get TEST_PIN). */
export async function ensureStaff(cafe: Cafe, userId: string, role: "waiter" | "manager" | "owner" = "waiter") {
  const pin = role === "waiter" ? TEST_PIN : "123456";
  const name = userId.charAt(0).toUpperCase() + userId.slice(1);
  const created = await cafe.createStaff({ venueId: VENUE, id: userId, name, role, pin });
  if (!created.ok && created.error !== "STAFF_EXISTS") throw new Error(`createStaff failed: ${created.error}`);
  return { pin };
}

/** A paired waiter tablet with `userId` signed in (a manager or owner can sign in on it too). */
export async function signedInWaiter(cafe: Cafe, userId: string, role: "waiter" | "manager" | "owner" = "waiter") {
  const { pin } = await ensureStaff(cafe, userId, role);
  const device = await pairDevice(cafe, "waiter");
  const signedIn = await cafe.signIn({ deviceToken: device.token, userId, pin });
  if (!signedIn.ok) throw new Error(`signIn failed: ${signedIn.error}`);
  return { ...device, sessionToken: signedIn.sessionToken };
}

// ---------- who connects ----------

/** Descriptors for connect(); credentials are created when connecting. */
export const stationHeaders = (stationId: string, _label?: string) => ({ who: "station" as const, stationId });
export const staffHeaders = (userId: string, role: "waiter" | "manager" | "owner" = "waiter") => ({
  who: "staff" as const,
  userId,
  role,
});
/** The live view has no public route yet; internal code identifies it with this header. */
export const liveHeaders = { "X-Cafe-Venue": VENUE, "X-Cafe-Role": "live", "X-Cafe-User": "owner-1" };

type Who = ReturnType<typeof stationHeaders> | ReturnType<typeof staffHeaders> | Record<string, string>;

async function headersFor(cafe: Cafe, who: Who): Promise<Record<string, string>> {
  if (who.who === "station") {
    const { token } = await pairDevice(cafe, "station", who.stationId as string);
    return { Authorization: `Bearer ${token}` };
  }
  if (who.who === "staff") {
    const { token, sessionToken } = await signedInWaiter(cafe, who.userId as string, who.role as "waiter" | "manager" | "owner");
    return { Authorization: `Bearer ${token}`, "X-Staff-Session": sessionToken };
  }
  return who as Record<string, string>;
}

/** Open a raw WebSocket upgrade request to the café (no credentials added). */
export async function upgrade(cafe: Cafe, headers: Record<string, string>) {
  return cafe.fetch("https://cafe/ws", { headers: { Upgrade: "websocket", ...headers } });
}

/** A test tablet: an open WebSocket plus a queue of the messages it received. */
export async function connect(cafe: Cafe, who: Who) {
  return connectWith(cafe, await headersFor(cafe, who));
}

export async function connectWith(cafe: Cafe, headers: Record<string, string>) {
  const response = await upgrade(cafe, headers);
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
  /** Resolves with the close code when the server closes this socket. */
  const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));

  const tablet = {
    closed,
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
