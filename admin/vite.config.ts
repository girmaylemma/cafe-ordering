/**
 * Dashboard build and dev server.
 *
 * Build: files go to ../server/public/admin, which the Worker serves under /admin/ (D-71).
 *
 * Local dev (`npm run dev`): there is no Cloudflare Access on your machine, so the dev proxy signs
 * an Access-style token with the TEST-ONLY key for DEV_EMAIL (default dev-owner@example.com) and
 * forwards /admin/api to `wrangler dev`. The server accepts that key only with a `.invalid` team
 * domain, which `scripts/dev-access-vars.mjs` puts in server/.dev.vars — never in production (D-62).
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { TEST_ACCESS_PRIVATE_JWK } from "../server/test/fixtures/accessKeys";

const API_TARGET = "http://127.0.0.1:8787";
export const DEV_TEAM_DOMAIN = "https://dev.cloudflareaccess.invalid";
export const DEV_AUDIENCE = "dev-audience";

async function devAccessToken(email: string): Promise<string> {
  const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: TEST_ACCESS_PRIVATE_JWK.kid, typ: "JWT" };
  const claims = { aud: [DEV_AUDIENCE], iss: DEV_TEAM_DOMAIN, email, iat: now, nbf: now, exp: now + 12 * 3600 };
  const input = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(claims)))}`;
  const key = await crypto.subtle.importKey("jwk", TEST_ACCESS_PRIVATE_JWK as JsonWebKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input)));
  return `${input}.${b64url(signature)}`;
}

export default defineConfig(async ({ command }) => ({
  base: "/admin/",
  plugins: [react()],
  build: { outDir: "../server/public/admin", emptyOutDir: true },
  server:
    command === "serve"
      ? {
          proxy: {
            "/admin/api": {
              target: API_TARGET,
              // Only the Access token is added. Host and the browser's Origin pass through unchanged:
              // both say localhost:5173, just as in production both name the real domain, so the
              // server's same-origin (CSRF) check behaves exactly as it will behind Access.
              headers: { "Cf-Access-Jwt-Assertion": await devAccessToken(process.env.DEV_EMAIL ?? "dev-owner@example.com") },
            },
          },
        }
      : undefined,
  test: { environment: "jsdom", setupFiles: ["./test/setup.ts"] },
}));
