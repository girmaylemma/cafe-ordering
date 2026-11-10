/** The public HTTP routes of the Worker (design.md §8): pairing, staff list, PIN sign-in, WebSocket. */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

// ---------- helpers ----------
/** Worker routes by the venue in the token, so each test uses its own venue id as the café name. */
async function newVenue() {
  const venueId = `venue-${crypto.randomUUID()}`;
  const cafe = env.CAFE.get(env.CAFE.idFromName(venueId));
  await cafe.createStaff({ venueId, id: "hana", name: "Hana", role: "waiter", pin: "1234" });
  return { venueId, cafe };
}

let counter = 0;
async function newCode(cafe: Awaited<ReturnType<typeof newVenue>>["cafe"], venueId: string, kind: "waiter" | "station" = "waiter") {
  const deviceId = `dev-${++counter}`;
  await cafe.createDevice({ venueId, id: deviceId, name: deviceId, kind, stationId: kind === "station" ? "kitchen" : null });
  const created = await cafe.createPairingCode(deviceId);
  if (!created.ok) throw new Error(created.error);
  return { deviceId, code: created.code };
}

const directory = () => env.DIRECTORY.get(env.DIRECTORY.idFromName("directory"));

/** Each test gets its own fake IP, so per-IP limits never leak between tests. */
const newIp = () => `10.0.${Math.floor(counter / 250)}.${++counter % 250}`;

function call(method: string, path: string, init: { body?: unknown; headers?: Record<string, string>; ip?: string } = {}) {
  const headers: Record<string, string> = { ...init.headers, "CF-Connecting-IP": init.ip ?? newIp() };
  let body: string | null = null;
  if (init.body !== undefined) {
    body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
    headers["Content-Type"] = "application/json";
  }
  return worker.fetch(new Request(`https://api.example${path}`, { method, headers, body }), env);
}

const pair = (code: string, ip?: string) => call("POST", "/devices/pair", { body: { code }, ...(ip ? { ip } : {}) });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function pairedToken(kind: "waiter" | "station" = "waiter") {
  const { venueId, cafe } = await newVenue();
  const { code } = await newCode(cafe, venueId, kind);
  const response = await pair(code);
  const body = (await response.json()) as { token: string };
  return { venueId, cafe, token: body.token };
}

// ---------- pairing ----------
describe("POST /devices/pair", () => {
  it("a valid code returns a device token, which then works", async () => {
    const { venueId, cafe } = await newVenue();
    const { deviceId, code } = await newCode(cafe, venueId);

    const response = await pair(code);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; device: unknown };
    expect(body.device).toEqual({ id: deviceId, name: deviceId, kind: "waiter", stationId: null });
    expect((await call("GET", "/staff", { headers: bearer(body.token) })).status).toBe(200);
  });

  it("a code works only once", async () => {
    const { venueId, cafe } = await newVenue();
    const { code } = await newCode(cafe, venueId);
    expect((await pair(code)).status).toBe(200);

    const again = await pair(code);
    expect(again.status).toBe(401);
    expect(await again.json()).toEqual({ error: "INVALID_CODE" });
  });

  it("an expired code is refused", async () => {
    const { venueId, cafe } = await newVenue();
    const { code } = await newCode(cafe, venueId);
    await runInDurableObject(directory(), (_i, state) => {
      state.storage.sql.exec("UPDATE pairing_codes SET expires_at = 0 WHERE code = ?", code);
    });

    expect((await pair(code)).status).toBe(401);
  });

  it("after 5 wrong codes from one IP, that IP is refused even with a right code; other IPs are not", async () => {
    const { venueId, cafe } = await newVenue();
    const { code } = await newCode(cafe, venueId);
    const ip = newIp();
    for (let i = 0; i < 5; i++) expect((await pair("000000", ip)).status).toBe(401);

    const blocked = await pair(code, ip);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "RATE_LIMITED" });
    expect((await pair(code, newIp())).status).toBe(200);
  });

  it("after 100 wrong codes in an hour from anywhere, pairing pauses for everyone (stops distributed guessing)", async () => {
    const { venueId, cafe } = await newVenue();
    const { code } = await newCode(cafe, venueId);
    try {
      for (let i = 0; i < 100; i++) await pair("000000"); // a new IP each time
      expect((await pair(code)).status).toBe(429);
    } finally {
      // The directory is shared by every test in this file: clear the counters again.
      await runInDurableObject(directory(), (_i, state) => {
        state.storage.sql.exec("DELETE FROM pairing_failures");
      });
    }
    expect((await pair(code)).status).toBe(200);
  });

  it.each([
    ["invalid JSON", "{oops"],
    ["a missing code", {}],
    ["a body over 1 KB", { code: "1".repeat(2000) }],
  ])("answers %s with 400", async (_label, body) => {
    expect((await call("POST", "/devices/pair", { body })).status).toBe(400);
  });
});

// ---------- tokens ----------
describe("device tokens", () => {
  it("GET /staff without a token, or with a garbage token, is 401", async () => {
    expect((await call("GET", "/staff")).status).toBe(401);
    expect((await call("GET", "/staff", { headers: bearer("garbage") })).status).toBe(401);
  });

  it("a token whose venue part was changed is refused before any café is touched", async () => {
    const { token } = await pairedToken();
    const [, tag, secret] = token.split(".");
    const forged = `venue-someone-else.${tag}.${secret}`;

    expect((await call("GET", "/staff", { headers: bearer(forged) })).status).toBe(401);
  });

  it("GET /staff lists the café's staff for a paired device", async () => {
    const { token } = await pairedToken();
    const response = await call("GET", "/staff", { headers: bearer(token) });
    expect(await response.json()).toEqual({ staff: [{ id: "hana", name: "Hana", role: "waiter" }] });
  });
});

// ---------- PIN sign-in ----------
describe("POST /auth/pin and /auth/sign-out", () => {
  it("the right PIN returns a session; a wrong PIN is 401; a locked user is 423", async () => {
    const { token } = await pairedToken();
    const signIn = (pin: string) => call("POST", "/auth/pin", { headers: bearer(token), body: { userId: "hana", pin } });

    const ok = await signIn("1234");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ sessionToken: expect.any(String), user: { id: "hana", name: "Hana" } });

    expect((await signIn("0000")).status).toBe(401);
    for (let i = 0; i < 4; i++) await signIn("0000");
    expect((await signIn("1234")).status).toBe(423);
  });

  it("a kitchen tablet cannot sign in a waiter (403)", async () => {
    const { token } = await pairedToken("station");
    const response = await call("POST", "/auth/pin", { headers: bearer(token), body: { userId: "hana", pin: "1234" } });
    expect(response.status).toBe(403);
  });

  it("after sign-out the session can no longer open a WebSocket", async () => {
    const { token } = await pairedToken();
    const signedIn = (await (await call("POST", "/auth/pin", { headers: bearer(token), body: { userId: "hana", pin: "1234" } })).json()) as {
      sessionToken: string;
    };
    const session = { ...bearer(token), "X-Staff-Session": signedIn.sessionToken };

    expect((await call("POST", "/auth/sign-out", { headers: session })).status).toBe(204);
    expect((await call("GET", "/ws", { headers: { ...session, Upgrade: "websocket" } })).status).toBe(401);
  });
});

// ---------- WebSocket through the Worker ----------
describe("GET /ws", () => {
  it("a station token opens a WebSocket through the public Worker", async () => {
    const { token } = await pairedToken("station");
    const response = await call("GET", "/ws", { headers: { ...bearer(token), Upgrade: "websocket" } });
    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
    response.webSocket?.accept();
    response.webSocket?.close();
  });

  it("forged X-Cafe-* headers are stripped: a waiter token plus 'I am the live view' is still a waiter without a session", async () => {
    const { token, venueId } = await pairedToken();
    const forged = { "X-Cafe-Venue": venueId, "X-Cafe-Role": "live", "X-Cafe-User": "owner-1" };
    const response = await call("GET", "/ws", { headers: { ...bearer(token), ...forged, Upgrade: "websocket" } });
    expect(response.status).toBe(401);
  });
});

it("unknown routes are 404", async () => {
  expect((await call("GET", "/nope")).status).toBe(404);
  expect((await call("GET", "/devices/pair")).status).toBe(404);
});
