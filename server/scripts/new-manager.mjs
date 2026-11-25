#!/usr/bin/env node
/**
 * Installer tool: add a manager to an existing café (D-97: only the developer creates managers;
 * the developer console replaces this in M4).
 *
 *   PowerShell:  $env:INSTALLER_SECRET = "<secret>"
 *                npm run new-manager -- --api https://api.example.com --venue v-abc123 --name "Dawit" --email dawit@example.com
 *
 * The venue id is printed by `npm run new-cafe`. The secret comes from the INSTALLER_SECRET
 * environment variable and the PIN is typed at a prompt, so neither ends up in your shell history.
 */
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    api: { type: "string" },
    venue: { type: "string" },
    name: { type: "string" },
    email: { type: "string" },
  },
});

const missing = ["api", "venue", "name", "email"].filter((k) => !values[k]);
const secret = process.env.INSTALLER_SECRET;
if (missing.length > 0 || !secret) {
  console.error(`Missing: ${[...missing.map((m) => `--${m}`), ...(secret ? [] : ["INSTALLER_SECRET env var"])].join(", ")}`);
  console.error('Example: npm run new-manager -- --api https://api.example.com --venue v-abc123 --name Dawit --email dawit@example.com');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const pin = (await rl.question("The manager's 6-digit PIN (for approving voids on tablets): ")).trim();
rl.close();
if (!/^\d{6}$/.test(pin)) {
  console.error("The manager PIN must be exactly 6 digits.");
  process.exit(1);
}

const response = await fetch(new URL(`/installer/venues/${encodeURIComponent(values.venue)}/managers`, values.api), {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({ name: values.name, email: values.email, pin }),
});
const body = await response.json().catch(() => ({}));
if (response.status !== 201) {
  console.error(`Failed (HTTP ${response.status}):`, body);
  process.exit(1);
}
console.log(`Added manager "${values.name}" (${values.email}) to ${values.venue}`);
console.log("Next: add this email to the Access application's policy so they can sign in.");
