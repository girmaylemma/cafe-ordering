#!/usr/bin/env node
/**
 * LOCAL DEVELOPMENT ONLY: point `wrangler dev` at a fake Cloudflare Access team, so the dashboard
 * dev server (admin/, `npm run dev`) can log you in with the TEST-ONLY key.
 *
 *   cd server; node scripts/dev-access-vars.mjs
 *
 * Writes ACCESS_TEAM_DOMAIN, ACCESS_AUD and ACCESS_JWKS_JSON into .dev.vars (gitignored), replacing
 * older values. The team domain ends in ".invalid", the only case in which the server accepts
 * injected keys (src/admin/access.ts, D-62), so these settings can never work in production.
 * Must match DEV_TEAM_DOMAIN / DEV_AUDIENCE in admin/vite.config.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TEST_ACCESS_JWKS } from "../test/fixtures/accessKeys.ts";

const file = fileURLToPath(new URL("../.dev.vars", import.meta.url));
const NAMES = ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ACCESS_JWKS_JSON"];

const kept = existsSync(file)
  ? readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => !NAMES.some((name) => line.startsWith(`${name}=`)) && !line.startsWith("# dev Access"))
  : [];
while (kept.length > 0 && kept.at(-1) === "") kept.pop();

const lines = [
  ...kept,
  "# dev Access (scripts/dev-access-vars.mjs): fake .invalid team, TEST-ONLY key. Never in production.",
  "ACCESS_TEAM_DOMAIN=https://dev.cloudflareaccess.invalid",
  "ACCESS_AUD=dev-audience",
  // Single quotes: a literal value for the dotenv parser (the JSON is full of double quotes).
  `ACCESS_JWKS_JSON='${JSON.stringify(TEST_ACCESS_JWKS)}'`,
  "",
];
writeFileSync(file, lines.join("\n"));
console.log(`Wrote dev Access settings to ${file}`);
console.log("Next: restart `npx wrangler dev`, create a café for dev-owner@example.com, then `npm run dev` in admin/.");
