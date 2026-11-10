/**
 * The public Worker (design.md §8). Every request goes through `stripInternalHeaders` first, so a
 * client can never claim an identity with X-Cafe-* headers (D-40). Tablets are identified only by
 * their device token, which also says which café to route to (D-50).
 *
 *   POST /devices/pair    { code }            -> { token, device }   pair a tablet with a one-time code
 *   GET  /menu            Bearer device       -> { categories, items }  active menu, both names
 *   GET  /tables          Bearer device       -> { tables }          active tables with free/open state
 *   GET  /staff           Bearer device       -> { staff }           names for the PIN screen
 *   POST /auth/pin        Bearer device       -> { sessionToken, user, expiresAt }
 *   POST /auth/sign-out   Bearer device + X-Staff-Session -> 204
 *   GET  /ws              Bearer device (+ X-Staff-Session for waiters), Upgrade: websocket
 *   /admin/api/*          dashboard API behind Cloudflare Access (src/admin/routes.ts)
 *   POST /installer/venues  Bearer INSTALLER_SECRET: create a café and its owner
 */
import { venueOfDeviceToken } from "./auth/crypto";
import { handleAdmin, handleInstaller } from "./admin/routes";
import { json, readJson, stripInternalHeaders } from "./http";

export { CafeDO } from "./cafe/CafeDO";
export { DirectoryDO } from "./directory/DirectoryDO";

export default {
  async fetch(incoming: Request, env: Env): Promise<Response> {
    const request = stripInternalHeaders(incoming);
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    if (url.pathname.startsWith("/admin/api/")) return handleAdmin(request, env);
    if (route === "POST /installer/venues") return handleInstaller(request, env);

    switch (route) {
      case "POST /devices/pair":
        return pairDevice(request, env);
      case "GET /menu":
        return withCafe(request, env, async (cafe, token) => {
          const result = await cafe.tabletMenu(token);
          return result.ok ? json(200, { categories: result.categories, items: result.items }) : json(401, { error: result.error });
        });
      case "GET /tables":
        return withCafe(request, env, async (cafe, token) => {
          const result = await cafe.tabletTables(token);
          return result.ok ? json(200, { tables: result.tables }) : json(401, { error: result.error });
        });
      case "GET /staff":
        return withCafe(request, env, async (cafe, token) => {
          const result = await cafe.listStaff(token);
          return result.ok ? json(200, { staff: result.staff }) : json(401, { error: result.error });
        });
      case "POST /auth/pin":
        return withCafe(request, env, async (cafe, token) => {
          const body = await readJson(request);
          if (body === null || typeof body.userId !== "string" || typeof body.pin !== "string") {
            return json(400, { error: "INVALID_REQUEST" });
          }
          const result = await cafe.signIn({ deviceToken: token, userId: body.userId, pin: body.pin });
          if (result.ok) return json(200, { sessionToken: result.sessionToken, user: result.user, expiresAt: result.expiresAt });
          switch (result.error) {
            case "LOCKED":
              return json(423, { error: result.error, retryAfterMs: result.retryAfterMs });
            case "NOT_A_WAITER_DEVICE":
              return json(403, { error: result.error });
            default:
              return json(401, { error: result.error });
          }
        });
      case "POST /auth/sign-out":
        return withCafe(request, env, async (cafe, token) => {
          const sessionToken = request.headers.get("X-Staff-Session");
          if (sessionToken === null) return json(400, { error: "INVALID_REQUEST" });
          const result = await cafe.signOut({ deviceToken: token, sessionToken });
          return result.ok ? new Response(null, { status: 204 }) : json(401, { error: result.error });
        });
      case "GET /ws":
        // The café Durable Object checks the full token (and PIN session) itself.
        return withCafe(request, env, (cafe) => cafe.fetch(request));
      default:
        return json(404, { error: "NOT_FOUND" });
    }
  },
} satisfies ExportedHandler<Env>;

type CafeStub = DurableObjectStub<import("./cafe/CafeDO").CafeDO>;

/**
 * Route to the café named in the device token. The token's venue part is signed, so a forged
 * venue is refused here without waking (or creating) any Durable Object.
 */
async function withCafe(
  request: Request,
  env: Env,
  handler: (cafe: CafeStub, token: string) => Promise<Response>,
): Promise<Response> {
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S{1,300})$/)?.[1];
  const venueId = token === undefined ? null : await venueOfDeviceToken(env.SERVER_SECRET, token);
  if (token === undefined || venueId === null) return json(401, { error: "UNAUTHORIZED_DEVICE" });
  return handler(env.CAFE.get(env.CAFE.idFromName(venueId)), token);
}

async function pairDevice(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  if (body === null || typeof body.code !== "string" || body.code.length > 20) {
    return json(400, { error: "INVALID_REQUEST" });
  }
  // Set by Cloudflare's edge in production; used for the per-IP guessing limit (D-52).
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName("directory"));
  const redeemed = await directory.redeemPairingCode(body.code, ip);
  if (!redeemed.ok) return json(redeemed.error === "RATE_LIMITED" ? 429 : 401, { error: redeemed.error });

  const cafe = env.CAFE.get(env.CAFE.idFromName(redeemed.venueId));
  const paired = await cafe.completePairing(redeemed.deviceId);
  if (!paired.ok) return json(409, { error: paired.error });
  return json(200, { token: paired.token, device: paired.device });
}
