/**
 * The dashboard's admin API under /admin/api (D1a) and the installer route.
 *
 * Every admin request: (1) state-changing requests must be same-origin JSON (CSRF, D-63),
 * (2) the Cloudflare Access token is verified (D-62), (3) the Directory says which café and staff
 * member the email belongs to, (4) the café re-checks that person's role and permissions.
 */
import { randomSecret, timingSafeEqualText } from "../auth/crypto";
import type { AdminError, AdminResult } from "../cafe/admin";
import { normalizeEmail } from "../cafe/admin";
import { json, readJson } from "../http";
import { accessConfig, verifyAccessJwt } from "./access";

const STATUS: Record<AdminError, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  INVALID_PIN: 400,
  EMAIL_TAKEN: 409,
  CANNOT_DEACTIVATE_SELF: 409,
  ALREADY_PAIRED: 409,
  DEVICE_REVOKED: 409,
  VENUE_EXISTS: 409,
  TABLE_IN_USE: 409,
};

/** Turn a café admin result into a response: `ok` fields as the body, errors as status codes. */
function respond(result: AdminResult<object>, okStatus = 200): Response {
  if (!result.ok) return json(STATUS[result.error], { error: result.error });
  const { ok: _ok, ...body } = result;
  return json(okStatus, body);
}

export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // (1) CSRF: a browser attaches the Access cookie to cross-site requests too.
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("Origin") !== url.origin) return json(403, { error: "CSRF" });
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
      return json(415, { error: "UNSUPPORTED_MEDIA_TYPE" });
    }
  }

  // (2) Who is this? Verified against Access's public keys.
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (token === null) return json(401, { error: "UNAUTHENTICATED" });
  let email: string;
  try {
    const verified = await verifyAccessJwt(token, accessConfig(env));
    if (verified === null) return json(401, { error: "UNAUTHENTICATED" });
    email = verified.email;
  } catch (error) {
    console.error("Access verification failed", error instanceof Error ? error.message : String(error));
    return json(500, { error: "ACCESS_MISCONFIGURED" });
  }

  // (3) Which café and person does this email belong to?
  const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName("directory"));
  const user = await directory.lookupDashboardUser(email);
  if (user === null) return json(403, { error: "FORBIDDEN" });
  const cafe = env.CAFE.get(env.CAFE.idFromName(user.venueId));
  const me = user.userId;

  // (4) Route; the café checks role and permissions for every call.
  const path = url.pathname.slice("/admin/api".length);
  // "/staff/abc/pin" -> "/staff/:id/pin", "/tables/abc" -> "/tables/:id"
  const route = `${request.method} ${path.replace(/^\/(staff|devices|categories|menu-items|tables|option-groups|options)\/[^/]+(?=\/|$)/, "/$1/:id")}`;
  const id = decodeURIComponent(path.split("/")[2] ?? "");
  const hasBody = request.method === "POST" || request.method === "PATCH";
  const body = hasBody ? await readJson(request, 2048) : null;
  if (hasBody && body === null) return json(400, { error: "INVALID_REQUEST" });
  const b = body ?? {};

  switch (route) {
    case "GET /me":
      return respond(await cafe.adminMe(me));
    case "GET /staff":
      return respond(await cafe.adminListStaff(me));
    case "POST /staff":
      return respond(await cafe.adminCreateStaff(me, { name: b.name, role: b.role, pin: b.pin, email: b.email ?? null }), 201);
    case "POST /staff/:id/deactivate":
      return respond(await cafe.adminDeactivateStaff(me, id));
    case "POST /staff/:id/pin":
      return respond(await cafe.adminResetPin(me, id, b.pin));
    case "GET /devices":
      return respond(await cafe.adminListDevices(me));
    case "POST /devices":
      return respond(await cafe.adminCreateDevice(me, { name: b.name, kind: b.kind, stationId: b.stationId ?? null }), 201);
    case "POST /devices/:id/pairing-code":
      return respond(await cafe.adminNewPairingCode(me, id));
    case "POST /devices/:id/revoke":
      return respond(await cafe.adminRevokeDevice(me, id));
    case "GET /categories":
      return respond(await cafe.adminListCategories(me));
    case "POST /categories":
      return respond(await cafe.adminCreateCategory(me, b), 201);
    case "PATCH /categories/:id":
      return respond(await cafe.adminUpdateCategory(me, id, b));
    case "GET /menu-items":
      return respond(await cafe.adminListMenuItems(me));
    case "POST /menu-items":
      return respond(await cafe.adminCreateMenuItem(me, b), 201);
    case "PATCH /menu-items/:id":
      return respond(await cafe.adminUpdateMenuItem(me, id, b));
    case "GET /tables":
      return respond(await cafe.adminListTables(me));
    case "POST /tables":
      return respond(await cafe.adminCreateTable(me, b), 201);
    case "PATCH /tables/:id":
      return respond(await cafe.adminUpdateTable(me, id, b));
    case "GET /option-groups":
      return respond(await cafe.adminListOptionGroups(me));
    case "POST /option-groups":
      return respond(await cafe.adminCreateOptionGroup(me, b), 201);
    case "PATCH /option-groups/:id":
      return respond(await cafe.adminUpdateOptionGroup(me, id, b));
    case "POST /option-groups/:id/options":
      return respond(await cafe.adminCreateOption(me, id, b), 201);
    case "PATCH /options/:id":
      return respond(await cafe.adminUpdateOption(me, id, b));
    default:
      return json(404, { error: "NOT_FOUND" });
  }
}

/**
 * POST /installer/venues — the installer creates a café and its owner (D-64).
 * Protected by INSTALLER_SECRET; café owners never use this.
 */
export async function handleInstaller(request: Request, env: Env): Promise<Response> {
  const given = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  const secret = env.INSTALLER_SECRET;
  if (!secret || given === undefined || !timingSafeEqualText(given, secret)) return json(401, { error: "UNAUTHORIZED" });

  const body = await readJson(request);
  const ownerEmail = normalizeEmail(body?.ownerEmail);
  const { name, ownerName, ownerPin } = body ?? {};
  if (typeof name !== "string" || typeof ownerName !== "string" || typeof ownerPin !== "string" || ownerEmail === null) {
    return json(400, { error: "INVALID_REQUEST" });
  }

  const venueId = `v-${randomSecret(9)}`; // unguessable; the signed device tokens carry it (D-50)
  const ownerId = crypto.randomUUID();
  const cafe = env.CAFE.get(env.CAFE.idFromName(venueId));
  const result = await cafe.bootstrapVenue({ venueId, name, owner: { id: ownerId, name: ownerName, email: ownerEmail, pin: ownerPin } });
  if (!result.ok) return json(STATUS[result.error], { error: result.error });
  return json(201, { venueId, owner: { id: ownerId } });
}
