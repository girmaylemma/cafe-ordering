/** Small HTTP helpers for the public Worker. */
import { INTERNAL_HEADER_PREFIX } from "./cafe/connection";

const MAX_BODY_BYTES = 4096;

/** Remove every X-Cafe-* header: only our own code may set them (D-40). */
export function stripInternalHeaders(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith(INTERNAL_HEADER_PREFIX)) headers.delete(name);
  }
  return new Request(request, { headers });
}

/** A small JSON object body, or null if missing, too large or not an object. */
export async function readJson(request: Request, maxBytes = 1024): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length === 0 || new TextEncoder().encode(text).byteLength > Math.min(maxBytes, MAX_BODY_BYTES)) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
