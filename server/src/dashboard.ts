/**
 * Serves the dashboard's built files (admin/ → server/public/admin) under /admin/ (D-65, D-71).
 *
 * The Worker routes this itself instead of using Cloudflare's single-page-app fallback, which
 * could answer a tablet's GET /menu with the dashboard's index.html.
 */

/** The parts of the ASSETS binding we use (lets tests pass a fake). */
export interface AssetStore {
  fetch(input: Request | string): Promise<Response>;
}

/**
 * Strict Content-Security-Policy: only our own scripts and styles (no inline), no framing
 * (clickjacking), API calls only to ourselves. The app must not use inline `style=""` attributes.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export async function serveDashboard(request: Request, assets: AssetStore): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/admin") return Response.redirect(`${url.origin}/admin/`, 308);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return withHeaders(new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } }), false);
  }

  let response = await assets.fetch(request);
  const isHashedAsset = url.pathname.startsWith("/admin/assets/");
  // App routes like /admin/staff have no file: the browser gets index.html and the app shows the page.
  // A missing hashed file stays 404: serving HTML as JavaScript would only confuse the browser.
  if (response.status === 404 && !isHashedAsset) {
    response = await assets.fetch(new Request(`${url.origin}/admin/index.html`, { method: request.method }));
  }
  return withHeaders(response, isHashedAsset && response.ok);
}

function withHeaders(response: Response, immutable: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  // Vite puts a content hash in asset file names, so they can be cached forever; index.html never.
  headers.set("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
