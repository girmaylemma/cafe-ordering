import { describe, expect, it } from "vitest";
import { actorFor, liveIdentityFromHeaders, recipientsFor, tagsFor } from "../src/cafe/connection";
import type { WireEvent } from "../src/cafe/protocol";

const headers = (values: Record<string, string>) => new Headers(values);

describe("liveIdentityFromHeaders (internal callers only)", () => {
  it("reads a live (dashboard) connection", () => {
    const id = liveIdentityFromHeaders(headers({ "X-Cafe-Venue": "v1", "X-Cafe-Role": "live", "X-Cafe-User": "owner-1" }));
    expect(id).toEqual({ role: "live", venueId: "v1", userId: "owner-1" });
  });

  it.each([
    ["no headers", {}],
    ["no venue", { "X-Cafe-Role": "live", "X-Cafe-User": "owner-1" }],
    ["no user", { "X-Cafe-Venue": "v1", "X-Cafe-Role": "live" }],
    ["a station role (stations must use a device token)", { "X-Cafe-Venue": "v1", "X-Cafe-Role": "station", "X-Cafe-Device": "d1", "X-Cafe-Station": "kitchen" }],
    ["a staff role (waiters must use a token and a PIN session)", { "X-Cafe-Venue": "v1", "X-Cafe-Role": "staff", "X-Cafe-Device": "d1", "X-Cafe-User": "hana" }],
    ["an over-long value", { "X-Cafe-Venue": "v".repeat(101), "X-Cafe-Role": "live", "X-Cafe-User": "x" }],
  ])("returns null for %s", (_label, values) => {
    expect(liveIdentityFromHeaders(headers(values))).toBeNull();
  });
});

describe("tags, actors and recipients", () => {
  const station = { role: "station", venueId: "v1", deviceId: "d1", stationId: "kitchen" } as const;
  const staff = { role: "staff", venueId: "v1", deviceId: "d2", userId: "hana" } as const;
  const live = { role: "live", venueId: "v1", userId: "owner-1" } as const;

  it("tags each connection by what it should receive, and by device so it can be closed on revoke", () => {
    expect(tagsFor(station)).toEqual(["station:kitchen", "device:d1"]);
    // "waiters": every waiter's floor map and menu get sold-out and table-state pushes (3b).
    expect(tagsFor(staff)).toEqual(["waiter:hana", "device:d2", "waiters"]);
    expect(tagsFor(live)).toEqual(["live"]);
  });

  it("derives the actor from the connection; live dashboards cannot send commands", () => {
    expect(actorFor(station)).toEqual({ kind: "station", stationId: "kitchen", deviceId: "d1" });
    expect(actorFor(staff)).toEqual({ kind: "staff", userId: "hana" });
    expect(actorFor(live)).toBeNull();
  });

  it("pushes an item event to its station, the live view, and the table's current waiter", () => {
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
    expect(recipientsFor(event, "hana")).toEqual(["station:bar", "live", "waiter:hana"]);
    // An item with no table session (no current waiter) goes to the station and live view only.
    expect(recipientsFor(event, null)).toEqual(["station:bar", "live"]);
  });
});
