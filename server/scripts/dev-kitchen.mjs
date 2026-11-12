#!/usr/bin/env node
/**
 * DEVELOPMENT ONLY: a pretend kitchen (or bar) tablet in the terminal, to test the waiter app
 * before the real kitchen screen exists (F3). It shows each item that arrives and lets you tap
 * Accept, Ready and Undo by typing.
 *
 * First time (pair it with a code from the dashboard: Tablets -> add a Kitchen tablet):
 *   cd server; node scripts/dev-kitchen.mjs --api http://127.0.0.1:8787 --code 123456
 * Afterwards (the token is kept in .dev-kitchen-token, gitignored):
 *   cd server; node scripts/dev-kitchen.mjs --api http://127.0.0.1:8787
 *
 * Commands:  a 3 = accept item 3   r 3 = ready   u 3 = undo the last tap on it   l = list   q = quit
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []),
);
const api = args.api ?? "http://127.0.0.1:8787";
const tokenFile = fileURLToPath(new URL("../.dev-kitchen-token", import.meta.url));

async function token() {
  if (args.code) {
    const res = await fetch(`${api}/devices/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: args.code }) });
    const body = await res.json();
    if (!res.ok) throw new Error(`Pairing failed: ${body.error ?? res.status}`);
    if (body.device.kind !== "station") throw new Error("That code is for a waiter tablet. Add a Kitchen (station) tablet in the dashboard.");
    writeFileSync(tokenFile, body.token);
    console.log(`Paired as "${body.device.name}" (${body.device.stationId}).`);
    return body.token;
  }
  if (!existsSync(tokenFile)) throw new Error("Not paired yet: run once with --code <pairing code from the dashboard>.");
  return readFileSync(tokenFile, "utf8").trim();
}

const items = []; // [{ n, id, text, state }]
const show = (i) => console.log(`  ${String(i.n).padStart(2)}. ${i.text.padEnd(40)} ${i.state}`);

function onEvent(e) {
  if (e.type === "item.sent") {
    const d = e.details ?? {};
    const options = (d.options ?? []).map((o) => o.nameEn).join(", ");
    const text = `${d.qty}× ${d.name}${options ? ` (${options})` : ""}${d.note ? ` "${d.note}"` : ""}`;
    const item = { n: items.length + 1, id: e.itemId, text, state: e.to };
    items.push(item);
    console.log("NEW:");
    show(item);
    return;
  }
  const item = items.find((i) => i.id === e.itemId);
  if (item) {
    item.state = e.to;
    console.log(`${e.type}:`);
    show(item);
  }
}

const ws = new WebSocket(`${api.replace(/^http/, "ws")}/ws`, { headers: { Authorization: `Bearer ${await token()}` } });
const commands = { a: "accept", r: "ready", u: "undo" };

ws.addEventListener("open", () => {
  console.log("Connected. Waiting for orders... (a N = accept, r N = ready, u N = undo, l = list, q = quit)");
  ws.send(JSON.stringify({ type: "sync", since: 0 }));
});
ws.addEventListener("close", (e) => {
  console.log(`Disconnected (${e.code}).${e.code === 4001 ? " This tablet was revoked: pair again with --code." : ""}`);
  process.exit(e.code === 1000 ? 0 : 1);
});
ws.addEventListener("error", () => console.log("Connection problem: is `npx wrangler dev` running, and is --api right?"));
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.type === "event") onEvent(msg.event);
  else if (msg.type === "sync.result") msg.events.forEach(onEvent);
  else if (msg.type === "ack" && msg.result.ok === false) console.log(`Refused: ${msg.result.error}`);
});

createInterface({ input: process.stdin }).on("line", (line) => {
  const [cmd, n] = line.trim().split(/\s+/);
  if (cmd === "q") return ws.close(1000);
  if (cmd === "l") return items.forEach(show);
  const item = items.find((i) => i.n === Number(n));
  if (!commands[cmd] || !item) return console.log("Type: a N, r N, u N, l or q (N = the item number).");
  ws.send(JSON.stringify({ type: "item.command", idempotencyKey: crypto.randomUUID(), itemId: item.id, command: { type: commands[cmd] } }));
});
