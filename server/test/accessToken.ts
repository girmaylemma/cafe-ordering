/** Signs Cloudflare-Access-style JWTs with the TEST-ONLY key, for tests. */
import { TEST_ACCESS_PRIVATE_JWK } from "./fixtures/accessKeys";

export const TEST_TEAM_DOMAIN = "https://tests.cloudflareaccess.invalid";
export const TEST_AUDIENCE = "test-audience";

const encoder = new TextEncoder();

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A token like Access sends in Cf-Access-Jwt-Assertion; override any claim or header field. */
export async function accessToken(
  email: string,
  overrides: { claims?: Record<string, unknown>; header?: Record<string, unknown> } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: "test-key-1", typ: "JWT", ...overrides.header };
  const claims = {
    aud: [TEST_AUDIENCE],
    email,
    iss: TEST_TEAM_DOMAIN,
    iat: now,
    nbf: now,
    exp: now + 3600,
    sub: `sub-${email}`,
    ...overrides.claims,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    TEST_ACCESS_PRIVATE_JWK as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}
