/** Serving the dashboard's built files under /admin/ (D2a, D-71). Uses a fake asset store. */
import { describe, expect, it } from "vitest";
import { serveDashboard } from "../src/dashboard";

/** A fake of the ASSETS binding: knows a few files, 404 for the rest; records what was asked. */
function fakeAssets(files: Record<string, string>) {
  const asked: string[] = [];
  return {
    asked,
    fetch: async (input: Request | string) => {
      const path = new URL(typeof input === "string" ? input : input.url).pathname;
      asked.push(path);
      return path in files ? new Response(files[path], { status: 200 }) : new Response("not found", { status: 404 });
    },
  };
}

const FILES = { "/admin/index.html": "<html>app</html>", "/admin/assets/app-3f9a.js": "console.log(1)" };
const get = (path: string, method = "GET") => new Request(`https://api.example${path}`, { method });

describe("serveDashboard", () => {
  it("serves an existing file", async () => {
    const response = await serveDashboard(get("/admin/assets/app-3f9a.js"), fakeAssets(FILES));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("console.log(1)");
  });

  it("serves index.html for app routes the browser navigates to (single-page app)", async () => {
    const response = await serveDashboard(get("/admin/staff"), fakeAssets(FILES));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>app</html>");
  });

  it("a missing hashed asset is a real 404 (not index.html, which would confuse the browser)", async () => {
    expect((await serveDashboard(get("/admin/assets/old-1234.js"), fakeAssets(FILES))).status).toBe(404);
  });

  it("redirects /admin to /admin/", async () => {
    const response = await serveDashboard(get("/admin"), fakeAssets(FILES));
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("https://api.example/admin/");
  });

  it("only GET and HEAD are allowed for files", async () => {
    expect((await serveDashboard(get("/admin/", "POST"), fakeAssets(FILES))).status).toBe(405);
  });

  it("adds security headers to every page: strict CSP, no framing, no type sniffing", async () => {
    const response = await serveDashboard(get("/admin/"), fakeAssets(FILES));
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("same-origin");
  });

  it("index.html is never cached (so a deploy shows up at once); hashed files are cached for a year", async () => {
    const page = await serveDashboard(get("/admin/"), fakeAssets(FILES));
    const asset = await serveDashboard(get("/admin/assets/app-3f9a.js"), fakeAssets(FILES));
    expect(page.headers.get("Cache-Control")).toBe("no-cache");
    expect(asset.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });
});
