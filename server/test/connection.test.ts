import { describe, expect, it } from "vitest";
import { actorFor, identityFromHeaders, recipientsFor, tagsFor } from "../src/cafe/connection";
import type { WireEvent } from "../src/cafe/protocol";

const headers = (values: Record<string, string>) => new Headers(values);

describe("identityFromHeaders", () => {
  it("reads a station connection", () => {
    const id = identityFromHeaders(
      headers({ "X-Cafe-Venue": "v1", "X-Cafe-Role": "station", "X-Cafe-Device": "d1", "X-Cafe-Station": "kitchen" }),
    );
    expect(id).toEqual({ role: "station", venueId: "v1", deviceId: "d1", stationId: "kitchen" });
  });

  it("reads a staff (waiter) connection", () => {
    const id = identityFromHeaders(
      headers({ "X-Cafe-Venue": "v1", "X-Cafe-Role": "staff", "X-Cafe-Device": "d2", "X-Cafe-User": "hana" }),
    );
    expect(id).toEqual({ role: "staff", venueId: "v1", deviceId: "d2", userId: "hana" });
  });

  it("reads a live (dashboard) connection", () => {
    const id = identityFromHeaders(headers({ "X-Cafe-Venue": "v1", "X-Cafe-Role": "live", "X-Cafe-User": "owner-1" }));
    expect(id).toEqual({ role: "live", venueId: "v1", userId: "owner-1" });
  });

  it.each([
    ["no headers", {}],
    ["no venue", { "X-Cafe-Role": "station", "X-Cafe-Device": "d1", "X-Cafe-Station": "kitchen" }],
    ["an unknown role", { "X-Cafe-Venue": "v1", "X-Cafe-Role": "admin", "X-Cafe-User": "x" }],
    ["a station without a station id", { "X-Cafe-Venue": "v1", "X-Cafe-Role": "station", "X-Cafe-Device": "d1" }],
    ["a staff connection without a user", { "X-Cafe-Venue": "v1", "X-Cafe-Role": "staff", "X-Cafe-Device": "d1" }],
    ["a staff connection without a device", { "X-Cafe-Venue": "v1", "X-Cafe-Role": "staff", "X-Cafe-User": "hana" }],
    ["an over-long value", { "X-Cafe-Venue": "v".repeat(101), "X-Cafe-Role": "live", "X-Cafe-User": "x" }],
  ])("returns null for %s", (_label, values) => {
    expect(identityFromHeaders(headers(values))).toBeNull();
  });
});

describe("tags, actors and recipients", () => {
  const station = { role: "station", venueId: "v1", deviceId: "d1", stationId: "kitchen" } as const;
  const staff = { role: "staff", venueId: "v1", deviceId: "d2", userId: "hana" } as const;
  const live = { role: "live", venueId: "v1", userId: "owner-1" } as const;

  it("tags each connection by what it should receive", () => {
    expect(tagsFor(station)).toEqual(["station:kitchen"]);
    expect(tagsFor(staff)).toEqual(["waiter:hana"]);
    expect(tagsFor(live)).toEqual(["live"]);
  });

  it("derives the actor from the connection; live dashboards cannot send commands", () => {
    expect(actorFor(station)).toEqual({ kind: "station", stationId: "kitchen", deviceId: "d1" });
    expect(actorFor(staff)).toEqual({ kind: "staff", userId: "hana" });
    expect(actorFor(live)).toBeNull();
  });

  it("pushes an item event to its station and the live view (waiters come in slice 3)", () => {
    const event: WireEvent = {
      seq: 1,
      orderId: "o1",
      itemId: "i1",
      stationId: "bar",
      type: "item.accepted",
      from: "sent",
      to: "accepted",
      actor: { kind: "station", stationId: "bar", deviceId: "d9" },
      at: 0,
    };
    expect(recipientsFor(event)).toEqual(["station:bar", "live"]);
  });
});
