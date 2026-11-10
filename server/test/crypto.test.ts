/**
 * Direct tests of the security helpers. The HTTP-level tests can't tell these apart from other
 * checks that also return 401 (found by planting bugs), so they are pinned down here.
 */
import { describe, expect, it } from "vitest";
import { makeDeviceToken, pinHash, venueOfDeviceToken } from "../src/auth/crypto";
import { stripInternalHeaders } from "../src/http";

const SECRET = "secret-a";

describe("device tokens: <venueId>.<routeTag>.<secret>", () => {
  it("round-trips: a token we issued routes to its venue", async () => {
    const token = await makeDeviceToken(SECRET, "venue-abebe");
    expect(token.split(".")).toHaveLength(3);
    expect(await venueOfDeviceToken(SECRET, token)).toBe("venue-abebe");
  });

  it("a changed venue part is refused (stops forged venues from waking Durable Objects)", async () => {
    const [, tag, secret] = (await makeDeviceToken(SECRET, "venue-abebe")).split(".");
    expect(await venueOfDeviceToken(SECRET, `venue-other.${tag}.${secret}`)).toBeNull();
  });

  it("a changed tag, or a token made with another server secret, is refused", async () => {
    const [venue, tag, secret] = (await makeDeviceToken(SECRET, "venue-abebe")).split(".");
    const flipped = (tag!.startsWith("A") ? "B" : "A") + tag!.slice(1);
    expect(await venueOfDeviceToken(SECRET, `${venue}.${flipped}.${secret}`)).toBeNull();
    expect(await venueOfDeviceToken("secret-b", `${venue}.${tag}.${secret}`)).toBeNull();
  });

  it.each([["garbage"], ["a.b"], ["a.b.c.d"], ["venue.with.dots.x"], ["venue-abebe.tag.short"]])(
    "a malformed token %s is refused",
    async (token) => {
      expect(await venueOfDeviceToken(SECRET, token)).toBeNull();
    },
  );

  it("refuses to issue a token for a venue id containing a dot", async () => {
    await expect(makeDeviceToken(SECRET, "bad.venue")).rejects.toThrow();
  });
});

describe("pinHash", () => {
  it("depends on the PIN, the salt and the server secret", async () => {
    const base = await pinHash(SECRET, "salt-1", "1234");
    expect(await pinHash(SECRET, "salt-1", "1234")).toBe(base);
    expect(await pinHash(SECRET, "salt-1", "1235")).not.toBe(base);
    expect(await pinHash(SECRET, "salt-2", "1234")).not.toBe(base);
    // Without SERVER_SECRET, a leaked database can't be brute-forced (D-51).
    expect(await pinHash("secret-b", "salt-1", "1234")).not.toBe(base);
  });
});

describe("stripInternalHeaders", () => {
  it("removes every X-Cafe-* header in any letter case and keeps the rest", () => {
    const request = new Request("https://api.example/ws", {
      headers: {
        "X-Cafe-Role": "live",
        "x-cafe-venue": "v1",
        "X-CAFE-USER": "owner",
        Authorization: "Bearer abc",
        Upgrade: "websocket",
      },
    });

    const stripped = stripInternalHeaders(request);

    expect([...stripped.headers.keys()].filter((k) => k.startsWith("x-cafe-"))).toEqual([]);
    expect(stripped.headers.get("Authorization")).toBe("Bearer abc");
    expect(stripped.headers.get("Upgrade")).toBe("websocket");
  });
});
