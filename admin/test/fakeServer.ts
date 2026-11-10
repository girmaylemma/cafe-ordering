/** A fake admin API for component tests: replaces `fetch`, answers by route, records every call. */
import { vi } from "vitest";

type Reply = [status: number, body: unknown];
type Handler = Reply | ((body: unknown) => Reply);

export interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

export function fakeServer(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = input.replace(/^\/admin\/api/, "");
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, path, body, headers: Object.fromEntries(new Headers(init.headers).entries()) });
    const handler = routes[`${method} ${path}`];
    if (handler === undefined) return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    const [status, reply] = typeof handler === "function" ? handler(body) : handler;
    return new Response(JSON.stringify(reply), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, routes };
}

export const OWNER_ME = {
  user: { id: "u-owner", name: "Abebe", role: "owner", email: "owner@example.com" },
  venue: { id: "v-1", name: "Abebe Cafe" },
};
export const MANAGER_ME = {
  user: { id: "u-manager", name: "Meseret", role: "manager", email: "manager@example.com" },
  venue: { id: "v-1", name: "Abebe Cafe" },
};
