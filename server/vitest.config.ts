import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Runs every test inside Cloudflare's real runtime (workerd), with the
// Durable Objects and SQLite declared in wrangler.jsonc.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // A fixed test-only secret, so tests never depend on a developer's .dev.vars.
      miniflare: { bindings: { SERVER_SECRET: "test-secret-not-for-production" } },
    }),
  ],
});
