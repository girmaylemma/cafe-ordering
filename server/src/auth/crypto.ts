/**
 * Cryptography for tokens and PINs (D-13, D-50, D-51). Uses only the Web Crypto API built into Workers.
 *
 * Two kinds of secrets need two kinds of hashing:
 * - Tokens (device, staff session) are 32 random bytes: far too many to guess, so a plain SHA-256
 *   of the token is safe to store.
 * - PINs have only 10^4..10^6 values: any plain hash is cracked in milliseconds. So a PIN is hashed
 *   with HMAC using a key derived from SERVER_SECRET, which lives in Cloudflare secrets and never
 *   in the database. A leaked database alone cannot be brute-forced.
 */

const encoder = new TextEncoder();

/** `bytes` random bytes as base64url text (no padding). */
export function randomSecret(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Hex SHA-256: for high-entropy secrets (tokens) only, never for PINs. */
export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/** Constant-time comparison, so response time doesn't reveal how much of a secret matched. */
export function timingSafeEqualText(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  return crypto.subtle.timingSafeEqual(left, right);
}

// ---------- keys derived from SERVER_SECRET ----------

/** One secret, separate keys per purpose, so a key used for one job can never be replayed in another. */
type KeyPurpose = "pin" | "route";

async function hmacKey(serverSecret: string, purpose: KeyPurpose): Promise<CryptoKey> {
  const root = await crypto.subtle.importKey("raw", encoder.encode(serverSecret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const derived = await crypto.subtle.sign("HMAC", root, encoder.encode(`cafe-ordering:${purpose}:v1`));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function hmac(serverSecret: string, purpose: KeyPurpose, message: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", await hmacKey(serverSecret, purpose), encoder.encode(message));
}

/** Hex HMAC of a PIN with its per-user salt (D-51). */
export async function pinHash(serverSecret: string, salt: string, pin: string): Promise<string> {
  return hex(await hmac(serverSecret, "pin", `${salt}:${pin}`));
}

// ---------- device tokens: "<venueId>.<routeTag>.<secret>" (D-50) ----------

/** Venue ids must not contain "." because it separates the token parts. */
const VENUE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Proves the venue part was issued by us, so a forged venue never wakes a Durable Object. */
async function routeTag(serverSecret: string, venueId: string): Promise<string> {
  return base64url(new Uint8Array(await hmac(serverSecret, "route", venueId)).slice(0, 16));
}

export function isValidVenueId(venueId: string): boolean {
  return VENUE_ID.test(venueId);
}

export async function makeDeviceToken(serverSecret: string, venueId: string): Promise<string> {
  if (!isValidVenueId(venueId)) throw new Error("invalid venue id");
  return `${venueId}.${await routeTag(serverSecret, venueId)}.${randomSecret()}`;
}

/**
 * The venue a device token claims, if its route tag is genuine. This only says where to route;
 * the café Durable Object still checks the whole token against its stored hash.
 */
export async function venueOfDeviceToken(serverSecret: string, token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [venueId, tag, secret] = parts as [string, string, string];
  if (!isValidVenueId(venueId) || tag.length === 0 || secret.length < 32) return null;
  return timingSafeEqualText(tag, await routeTag(serverSecret, venueId)) ? venueId : null;
}

// ---------- encoding ----------

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
