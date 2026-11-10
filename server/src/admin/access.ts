/**
 * Verifies the login token Cloudflare Access puts on every dashboard request (D-12, D-62).
 *
 * Access logs the user in before the request reaches us and adds a signed JWT in the
 * `Cf-Access-Jwt-Assertion` header. Anyone can send that header straight to our Worker, so we
 * must check the RS256 signature against Access's public keys, plus issuer, audience and time.
 */

export interface AccessConfig {
  /** e.g. "https://abebe.cloudflareaccess.com" */
  teamDomain: string;
  /** The Access application's "AUD tag". */
  audience: string;
  /** TEST ONLY: fixed public keys instead of fetching them. Refused unless the team domain ends in ".invalid". */
  jwksJson?: string | undefined;
}

export function accessConfig(env: Env & { ACCESS_JWKS_JSON?: string }): AccessConfig {
  return { teamDomain: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD, jwksJson: env.ACCESS_JWKS_JSON };
}

type Jwk = JsonWebKey & { kid?: string };

const CLOCK_SKEW_S = 60;
const KEYS_TTL_MS = 60 * 60_000;
const FORCED_REFRESH_MIN_MS = 60_000;

/** Public keys per team domain. Module scope: shared by requests on the same Worker instance. */
const keyCache = new Map<string, { keys: Jwk[]; fetchedAt: number; lastForcedAt: number }>();

/** The verified email (lower case), or null for any invalid token. Throws only on misconfiguration. */
export async function verifyAccessJwt(token: string, config: AccessConfig, nowMs = Date.now()): Promise<{ email: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  const header = decodeJson(headerPart);
  // Only RS256: refusing "none" and HS256 blocks the classic algorithm-confusion attacks.
  if (header === null || header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const key = await findKey(config, header.kid, nowMs);
  if (key === null) return null;

  const signature = decodeBytes(signaturePart);
  if (signature === null) return null;
  let valid = false;
  try {
    const cryptoKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, new TextEncoder().encode(`${headerPart}.${payloadPart}`));
  } catch {
    return null;
  }
  if (!valid) return null;

  // Only now, with a genuine signature, are the claims worth reading.
  const claims = decodeJson(payloadPart);
  if (claims === null) return null;
  const nowS = Math.floor(nowMs / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== trimSlash(config.teamDomain)) return null;
  if (!audiences.includes(config.audience)) return null;
  if (typeof claims.exp !== "number" || claims.exp < nowS - CLOCK_SKEW_S) return null;
  if (typeof claims.nbf === "number" && claims.nbf > nowS + CLOCK_SKEW_S) return null;
  if (typeof claims.email !== "string" || claims.email.length === 0) return null; // service tokens have no email
  return { email: claims.email.toLowerCase() };
}

async function findKey(config: AccessConfig, kid: string, nowMs: number): Promise<Jwk | null> {
  if (config.jwksJson !== undefined) {
    if (!new URL(config.teamDomain).hostname.endsWith(".invalid")) {
      throw new Error("ACCESS_JWKS_JSON is only allowed with a .invalid test team domain");
    }
    return (JSON.parse(config.jwksJson) as { keys: Jwk[] }).keys.find((k) => k.kid === kid) ?? null;
  }

  let entry = keyCache.get(config.teamDomain);
  if (entry === undefined || nowMs - entry.fetchedAt > KEYS_TTL_MS) {
    entry = { keys: await fetchKeys(config.teamDomain), fetchedAt: nowMs, lastForcedAt: entry?.lastForcedAt ?? 0 };
    keyCache.set(config.teamDomain, entry);
  }
  let key = entry.keys.find((k) => k.kid === kid);
  // Access rotates keys: an unknown kid may be brand new. Refetch, but at most once a minute.
  if (key === undefined && nowMs - entry.lastForcedAt > FORCED_REFRESH_MIN_MS) {
    entry = { keys: await fetchKeys(config.teamDomain), fetchedAt: nowMs, lastForcedAt: nowMs };
    keyCache.set(config.teamDomain, entry);
    key = entry.keys.find((k) => k.kid === kid);
  }
  return key ?? null;
}

async function fetchKeys(teamDomain: string): Promise<Jwk[]> {
  const response = await fetch(`${trimSlash(teamDomain)}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`could not fetch Access keys: HTTP ${response.status}`);
  return ((await response.json()) as { keys: Jwk[] }).keys;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function decodeBytes(part: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) return null;
  try {
    const binary = atob(part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJson(part: string): Record<string, unknown> | null {
  const bytes = decodeBytes(part);
  if (bytes === null) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
