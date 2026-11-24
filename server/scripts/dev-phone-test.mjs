#!/usr/bin/env node
/**
 * DEVELOPMENT ONLY: prepare everything to test the waiter app on a real phone, in one command.
 *
 *   cd server; node scripts/dev-phone-test.mjs
 *
 * Needs `npx wrangler dev --ip 0.0.0.0` running (after `node scripts/dev-access-vars.mjs`).
 * Safe to run again: it only adds what is missing. It:
 *   1. creates the "Dev Cafe" (owner dev-owner@example.com) if it doesn't exist yet,
 *   2. adds waiters Hana (PIN 1234) and Abel (PIN 5678), manager Meron (PIN 246810), 3 dishes and 3 tables,
 *   3. pairs the pretend kitchen (scripts/dev-kitchen.mjs) and
 *   4. prints the phone's pairing code, a kitchen pairing code (a second device running the same
 *      app becomes the real kitchen screen) and the exact command to build the app for this PC.
 * Uses the local TEST-ONLY Access key, which the server accepts only with the fake ".invalid"
 * team from dev-access-vars.mjs (D-62): it can never work against a real deployment.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { TEST_ACCESS_PRIVATE_JWK } from "../test/fixtures/accessKeys.ts";

const wifiAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a.address)
  .sort((a, b) => Number(b.startsWith("192.168.")) - Number(a.startsWith("192.168.")));
const START = String.raw`cd C:\Users\lenovo\Projects\cafe-ordering\server; npx.cmd wrangler dev --ip 0.0.0.0`;

/** The server's address: this PC (127.0.0.1), or the Wi-Fi address if it was started with --ip <that address>. */
async function findServer() {
  if (process.env.DEV_API) return process.env.DEV_API; // only for testing this script
  // The server takes a few seconds to start: keep trying for up to 90 s.
  for (let attempt = 0; attempt < 45; attempt++) {
    for (const host of ["127.0.0.1", ...wifiAddresses]) {
      try {
        await fetch(`http://${host}:8787/menu`, { signal: AbortSignal.timeout(2000) });
        return `http://${host}:8787`;
      } catch {
        // not there: try the next address
      }
    }
    if (attempt === 0) console.log("Waiting for the server to start...");
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}
const OWNER = "dev-owner@example.com";
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

function stop(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

// ---------- local settings ----------
let devVars = "";
try {
  devVars = readFileSync(here("../.dev.vars"), "utf8");
} catch {
  stop("server\\.dev.vars is missing. Copy .dev.vars.example to .dev.vars first.");
}
const setting = (name) => devVars.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1].trim().replace(/^['"]|['"]$/g, "");
if (!setting("ACCESS_TEAM_DOMAIN")?.endsWith(".invalid")) {
  stop("Run `node scripts/dev-access-vars.mjs` first, then restart `npx wrangler dev --ip 0.0.0.0`.");
}

// ---------- talking to the local server ----------
async function call(method, path, body, headers = {}) {
  let res;
  try {
    res = await fetch(API + path, { method, headers: { "content-type": "application/json", ...headers }, body: body && JSON.stringify(body) });
  } catch {
    stop(`The server stopped answering. In another window run:
  ${START}`);
  }
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...json };
}
async function must(method, path, body, headers) {
  const r = await call(method, path, body, headers);
  if (!r.ok) stop(`${method} ${path} failed: ${r.error ?? r.status}`);
  return r;
}

async function accessToken() {
  const b64 = (x) => Buffer.from(x).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", kid: TEST_ACCESS_PRIVATE_JWK.kid, typ: "JWT" }));
  const claims = b64(JSON.stringify({ aud: ["dev-audience"], iss: "https://dev.cloudflareaccess.invalid", email: OWNER, iat: now, nbf: now, exp: now + 3600 }));
  const key = await crypto.subtle.importKey("jwk", TEST_ACCESS_PRIVATE_JWK, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64(new Uint8Array(sig))}`;
}

const API = await findServer();
if (API === null) stop(`The server is not running. Open another PowerShell window and run:
  ${START}
Wait for "Ready on", then run this again.`);

// ---------- 1. the café ----------
const created = await call("POST", "/installer/venues", { name: "Dev Cafe", ownerName: "Dev Owner", ownerEmail: OWNER, ownerPin: "135790" }, { Authorization: `Bearer ${setting("INSTALLER_SECRET")}` });
if (created.ok) console.log("✓ Created the café \"Dev Cafe\"");
else if (created.error === "EMAIL_TAKEN") console.log("✓ The café already exists");
else stop(`Could not create the café: ${created.error ?? created.status}`);

const token = await accessToken();
const admin = (method, path, body) => must(method, `/admin/api${path}`, body, { "Cf-Access-Jwt-Assertion": token, Origin: API });

// ---------- 2. staff, menu, tables (only what is missing) ----------
const staff = (await admin("GET", "/staff")).staff;
for (const [name, role, pin] of [["Hana", "waiter", "1234"], ["Abel", "waiter", "5678"], ["Meron", "manager", "246810"]]) {
  const existing = staff.find((s) => s.name === name && s.active);
  if (existing) await admin("POST", `/staff/${existing.id}/pin`, { pin }); // a known PIN for the test
  else await admin("POST", "/staff", { name, role, pin });
}
console.log("✓ Staff: Hana (waiter, PIN 1234), Abel (waiter, PIN 5678), Meron (manager, PIN 246810)");

// Amharic names too (F4b), so both names show; added to an existing test café when missing.
let food = (await admin("GET", "/categories")).categories.find((c) => c.nameEn === "Food");
food ??= (await admin("POST", "/categories", { nameEn: "Food", nameAm: "ምግብ", sortOrder: 0 })).category;
if (!food.nameAm) await admin("PATCH", `/categories/${food.id}`, { nameAm: "ምግብ" });
const items = (await admin("GET", "/menu-items")).items;
for (const [i, [nameEn, nameAm, price]] of [["Shiro", "ሽሮ", "180"], ["Tibs", "ጥብስ", "320"], ["Firfir", "ፍርፍር", "150"]].entries()) {
  const existing = items.find((m) => m.nameEn === nameEn);
  if (!existing) await admin("POST", "/menu-items", { categoryId: food.id, nameEn, nameAm, price, stationId: "kitchen", fasting: false, sortOrder: i });
  else if (!existing.nameAm) await admin("PATCH", `/menu-items/${existing.id}`, { nameAm });
}
console.log("✓ Menu: Shiro ሽሮ, Tibs ጥብስ, Firfir ፍርፍር (kitchen)");

const tables = (await admin("GET", "/tables")).tables;
for (const [i, name] of ["Table 1", "Table 2", "Table 3"].entries()) {
  if (!tables.some((t) => t.name === name)) await admin("POST", "/tables", { name, area: null, seats: 4, sortOrder: i });
}
console.log("✓ Tables: Table 1, Table 2, Table 3");

// ---------- 3. the pretend kitchen: paired here, so dev-kitchen.mjs needs no code ----------
const stamp = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const kitchen = await admin("POST", "/devices", { name: `Test kitchen ${stamp}`, kind: "station", stationId: "kitchen" });
const paired = await must("POST", "/devices/pair", { code: kitchen.pairingCode.code });
writeFileSync(here("../.dev-kitchen-token"), paired.token);
console.log("✓ Pretend kitchen paired");

// ---------- 4. the phone, and a real kitchen screen (same app, a second device) ----------
const phone = await admin("POST", "/devices", { name: `Test phone ${stamp}`, kind: "waiter" });
const kitchenTablet = await admin("POST", "/devices", { name: `Kitchen tablet ${stamp}`, kind: "station", stationId: "kitchen" });
const addresses = wifiAddresses;
const ip = addresses[0] ?? "<PC-IP>";

console.log(`
==================================================================
  PHONE PAIRING CODE:     ${phone.pairingCode.code}      (works for 10 minutes)
  Waiters: Hana PIN 1234, Abel PIN 5678     Manager: Meron PIN 246810

  KITCHEN PAIRING CODE:   ${kitchenTablet.pairingCode.code}      (a 2nd phone/tablet = kitchen screen)
==================================================================

Build the app for this PC (in the apps\\tablet folder):
  flutter build apk --debug --dart-define=API_URL=http://${ip}:8787
${addresses.length > 1 ? `\n(This PC has more than one address: ${addresses.join(", ")}. Use the Wi-Fi one if ${ip} doesn't work.)\n` : ""}
The pretend kitchen (in the server folder):
  node scripts/dev-kitchen.mjs --api ${API}

Code expired? Just run this command again: it makes a new one.
`);
