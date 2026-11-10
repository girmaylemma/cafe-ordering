#!/usr/bin/env node
/**
 * Installer tool: create a café and its owner (D-64).
 *
 *   PowerShell:  $env:INSTALLER_SECRET = "<secret>"
 *                npm run new-cafe -- --api https://api.example.com --name "Abebe Cafe" --owner-name "Abebe" --owner-email owner@example.com
 *
 * The secret comes from the INSTALLER_SECRET environment variable and the owner's PIN is typed
 * at a prompt, so neither ends up in your shell history. No dependencies: Node 18+ only.
 */
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    api: { type: "string" },
    name: { type: "string" },
    "owner-name": { type: "string" },
    "owner-email": { type: "string" },
  },
});

const missing = ["api", "name", "owner-name", "owner-email"].filter((k) => !values[k]);
const secret = process.env.INSTALLER_SECRET;
if (missing.length > 0 || !secret) {
  console.error(`Missing: ${[...missing.map((m) => `--${m}`), ...(secret ? [] : ["INSTALLER_SECRET env var"])].join(", ")}`);
  console.error('Example: npm run new-cafe -- --api https://api.example.com --name "Abebe Cafe" --owner-name Abebe --owner-email owner@example.com');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ownerPin = (await rl.question("Owner's 6-digit PIN (for approving voids on tablets): ")).trim();
rl.close();
if (!/^\d{6}$/.test(ownerPin)) {
  console.error("The owner PIN must be exactly 6 digits.");
  process.exit(1);
}

const response = await fetch(new URL("/installer/venues", values.api), {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({ name: values.name, ownerName: values["owner-name"], ownerEmail: values["owner-email"], ownerPin }),
});
const body = await response.json().catch(() => ({}));
if (response.status !== 201) {
  console.error(`Failed (HTTP ${response.status}):`, body);
  process.exit(1);
}
console.log(`Created café "${values.name}"`);
console.log(`  venue id: ${body.venueId}`);
console.log(`  owner:    ${values["owner-email"]} (dashboard login via Cloudflare Access)`);
console.log("Next: add this email to the Access application's policy so the owner can sign in.");
