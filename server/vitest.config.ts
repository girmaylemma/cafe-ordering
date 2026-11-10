import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { TEST_ACCESS_JWKS } from "./test/fixtures/accessKeys";

// Runs every test inside Cloudflare's real runtime (workerd), with the
// Durable Objects and SQLite declared in wrangler.jsonc.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Fixed test-only values, so tests never depend on a developer's .dev.vars.
      miniflare: {
        bindings: {
          SERVER_SECRET: "test-secret-not-for-production",
          INSTALLER_SECRET: "test-installer-secret",
          // ".invalid" can never be a real domain; only then are injected test keys accepted.
          ACCESS_TEAM_DOMAIN: "https://tests.cloudflareaccess.invalid",
          ACCESS_AUD: "test-audience",
          ACCESS_JWKS_JSON: JSON.stringify(TEST_ACCESS_JWKS),
        },
      },
    }),
  ],
});
