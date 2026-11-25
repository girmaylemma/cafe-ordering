#!/usr/bin/env node
/**
 * Installer tool: create a café and its first manager (D-64, D-97: there is no café owner role).
 *
 *   PowerShell:  $env:INSTALLER_SECRET = "<secret>"
 *                npm run new-cafe -- --api https://api.example.com --name "Abebe Cafe" --manager-name "Meron" --manager-email meron@example.com
 *
 * More managers: npm run new-manager. The secret comes from the INSTALLER_SECRET environment
 * variable and the manager's PIN is typed
 * at a prompt, so neither ends up in your shell history. No dependencies: Node 18+ only.
 */
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    api: { type: "string" },
    name: { type: "string" },
    "manager-name": { type: "string" },
    "manager-email": { type: "string" },
  },
});

const missing = ["api", "name", "manager-name", "manager-email"].filter((k) => !values[k]);
const secret = process.env.INSTALLER_SECRET;
if (missing.length > 0 || !secret) {
  console.error(`Missing: ${[...missing.map((m) => `--${m}`), ...(secret ? [] : ["INSTALLER_SECRET env var"])].join(", ")}`);
  console.error('Example: npm run new-cafe -- --api https://api.example.com --name "Abebe Cafe" --manager-name Meron --manager-email meron@example.com');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const managerPin = (await rl.question("First manager's 6-digit PIN (for approving voids on tablets): ")).trim();
rl.close();
if (!/^\d{6}$/.test(managerPin)) {
  console.error("The manager PIN must be exactly 6 digits.");
  process.exit(1);
}

const response = await fetch(new URL("/installer/venues", values.api), {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({ name: values.name, managerName: values["manager-name"], managerEmail: values["manager-email"], managerPin }),
});
const body = await response.json().catch(() => ({}));
if (response.status !== 201) {
  console.error(`Failed (HTTP ${response.status}):`, body);
  process.exit(1);
}
console.log(`Created café "${values.name}"`);
console.log(`  venue id: ${body.venueId}`);
console.log(`  manager:  ${values["manager-email"]} (dashboard login via Cloudflare Access)`);
console.log("Next: add this email to the Access application's policy so the manager can sign in.");
