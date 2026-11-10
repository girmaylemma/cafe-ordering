/** Cloudflare Access token verification (D-12, D-62). Every way a token can be wrong is refused. */
import { describe, expect, it } from "vitest";
import { verifyAccessJwt, type AccessConfig } from "../src/admin/access";
import { TEST_ACCESS_JWKS } from "./fixtures/accessKeys";
import { TEST_AUDIENCE, TEST_TEAM_DOMAIN, accessToken } from "./accessToken";

const config: AccessConfig = { teamDomain: TEST_TEAM_DOMAIN, audience: TEST_AUDIENCE, jwksJson: JSON.stringify(TEST_ACCESS_JWKS) };
const now = () => Math.floor(Date.now() / 1000);

describe("verifyAccessJwt", () => {
  it("accepts a valid token and returns the email in lower case", async () => {
    expect(await verifyAccessJwt(await accessToken("Owner@Example.COM"), config)).toEqual({ email: "owner@example.com" });
  });

  it("also accepts an audience given as a single string", async () => {
    const token = await accessToken("a@example.com", { claims: { aud: TEST_AUDIENCE } });
    expect(await verifyAccessJwt(token, config)).toEqual({ email: "a@example.com" });
  });

  it.each([
    ["another application's audience", { claims: { aud: ["other-app"] } }],
    ["another team's issuer", { claims: { iss: "https://evil.cloudflareaccess.com" } }],
    ["an expired token", { claims: { exp: now() - 120 } }],
    ["a token not valid yet", { claims: { nbf: now() + 600 } }],
    ["no email (a service token)", { claims: { email: undefined } }],
    ["an unknown key id", { header: { kid: "someone-elses-key" } }],
    ["algorithm 'none'", { header: { alg: "none" } }],
    ["algorithm HS256 (key-confusion attack)", { header: { alg: "HS256" } }],
  ])("refuses %s", async (_label, overrides) => {
    expect(await verifyAccessJwt(await accessToken("a@example.com", overrides), config)).toBeNull();
  });

  it("refuses a token whose payload was changed after signing", async () => {
    const [header, , signature] = (await accessToken("waiter@example.com")).split(".");
    const forgedPayload = btoa(JSON.stringify({ aud: [TEST_AUDIENCE], iss: TEST_TEAM_DOMAIN, email: "owner@example.com", exp: now() + 3600 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifyAccessJwt(`${header}.${forgedPayload}.${signature}`, config)).toBeNull();
  });

  it.each([["garbage"], ["a.b"], ["a.b.c"], [""]])("refuses the malformed token %j", async (token) => {
    expect(await verifyAccessJwt(token, config)).toBeNull();
  });

  it("refuses injected test keys unless the team domain ends in .invalid (they could never be trusted in production)", async () => {
    const production = { ...config, teamDomain: "https://abebe.cloudflareaccess.com" };
    const token = await accessToken("a@example.com", { claims: { iss: production.teamDomain } });
    await expect(verifyAccessJwt(token, production)).rejects.toThrow(/\.invalid/);
  });
});
