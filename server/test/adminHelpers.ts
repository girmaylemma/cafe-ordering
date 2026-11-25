/** Shared helpers for tests of the dashboard admin API (through the public Worker). */
import { env } from "cloudflare:workers";
import { expect } from "vitest";
import worker from "../src/index";
import { accessToken } from "./accessToken";

export const ORIGIN = "https://api.example";
export let counter = 0;
export const uid = () => `${++counter}-${crypto.randomUUID().slice(0, 6)}`;

export function call(method: string, path: string, init: { headers?: Record<string, string>; body?: unknown } = {}) {
  const body = init.body === undefined ? null : typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers: init.headers ?? {}, body }), env);
}

const INSTALLER = { Authorization: "Bearer test-installer-secret", "Content-Type": "application/json" };

/** Create a café and its first manager through the installer route (D-97). */
export async function newCafe(name = "Abebe Cafe") {
  const managerEmail = `manager-${uid()}@example.com`;
  const response = await call("POST", "/installer/venues", {
    headers: INSTALLER,
    body: { name, managerName: "Abebe", managerEmail, managerPin: "123456" },
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { venueId: string; manager: { id: string } };
  return { ...body, managerEmail };
}

/** A dashboard request as the browser sends it behind Access: same-origin JSON plus the Access token. */
export async function admin(method: string, path: string, email: string, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { "Cf-Access-Jwt-Assertion": await accessToken(email), ...extra };
  if (method !== "GET") {
    headers.Origin ??= ORIGIN;
    headers["Content-Type"] ??= "application/json";
  }
  for (const [k, v] of Object.entries(extra)) if (v === "") delete headers[k];
  return call(method, path, { headers, ...(body === undefined ? {} : { body }) });
}

export async function json<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** A café with two managers: the first, and another added by the installer (only it can add managers, D-97). */
export async function cafeWithManager() {
  const cafe = await newCafe();
  const otherManagerEmail = `other-${uid()}@example.com`;
  const created = await call("POST", `/installer/venues/${cafe.venueId}/managers`, {
    headers: INSTALLER,
    body: { name: "Meseret", email: otherManagerEmail, pin: "654321" },
  });
  expect(created.status).toBe(201);
  const { manager } = (await created.json()) as { manager: { id: string } };
  return { ...cafe, otherManagerEmail, otherManagerId: manager.id };
}
