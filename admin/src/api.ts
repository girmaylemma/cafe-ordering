/**
 * Calls the admin API on the same origin. The browser sends Cloudflare Access's cookie itself;
 * changes are always JSON, which the server requires against cross-site requests (D-63).
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export async function api<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`/admin/api${path}`, init);
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  if (!response.ok) throw new ApiError(response.status, typeof data.error === "string" ? data.error : `HTTP_${response.status}`);
  return data as T;
}
