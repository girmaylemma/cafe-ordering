import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DevicesPage } from "../src/pages/DevicesPage";
import { OWNER_ME, fakeServer } from "./fakeServer";

const DEVICES = [
  { id: "d-k", name: "Kitchen 1", kind: "station", stationId: "kitchen", status: "paired" },
  { id: "d-t", name: "Tablet A", kind: "waiter", stationId: null, status: "unpaired" },
  { id: "d-old", name: "Old tablet", kind: "waiter", stationId: null, status: "revoked" },
];

const row = (name: string) => screen.getByText(name).closest("tr")!;

describe("DevicesPage", () => {
  it("lists tablets with type and status", async () => {
    fakeServer({ "GET /devices": [200, { devices: DEVICES }] });
    render(<DevicesPage me={OWNER_ME} />);

    expect(await screen.findByText("Kitchen 1")).toBeTruthy();
    expect(within(row("Kitchen 1")).getByText("Kitchen station")).toBeTruthy();
    expect(within(row("Tablet A")).getByText("Not paired yet")).toBeTruthy();
    expect(within(row("Old tablet")).getByText("Revoked")).toBeTruthy();
  });

  it("the station choice only appears for kitchen/bar tablets", async () => {
    fakeServer({ "GET /devices": [200, { devices: [] }] });
    render(<DevicesPage me={OWNER_ME} />);
    await screen.findByRole("heading", { name: "Tablets" });

    expect(screen.queryByLabelText("Station")).toBeNull();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "station" } });
    expect(screen.getByLabelText("Station")).toBeTruthy();
  });

  it("adding a tablet shows its 6-digit pairing code in large text", async () => {
    const server = fakeServer({
      "GET /devices": [200, { devices: [] }],
      "POST /devices": [201, { device: { id: "d-new", name: "Bar 1", kind: "station", stationId: "bar", status: "unpaired" }, pairingCode: { code: "482913", expiresAt: Date.now() + 600_000 } }],
    });
    render(<DevicesPage me={OWNER_ME} />);
    await screen.findByRole("heading", { name: "Tablets" });

    fireEvent.change(screen.getByLabelText("Tablet name"), { target: { value: "Bar 1" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "station" } });
    fireEvent.change(screen.getByLabelText("Station"), { target: { value: "bar" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tablet" }));

    const code = await screen.findByTestId("pairing-code");
    expect(code.textContent).toBe("482 913");
    expect(screen.getByText(/enter this code on the tablet/i)).toBeTruthy();
    expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Bar 1", kind: "station", stationId: "bar" });
  });

  it("only unpaired tablets offer a new code; only non-revoked tablets offer Revoke", async () => {
    fakeServer({ "GET /devices": [200, { devices: DEVICES }] });
    render(<DevicesPage me={OWNER_ME} />);
    await screen.findByText("Kitchen 1");

    expect(within(row("Tablet A")).getByRole("button", { name: /new code/i })).toBeTruthy();
    expect(within(row("Kitchen 1")).queryByRole("button", { name: /new code/i })).toBeNull();
    expect(within(row("Old tablet")).queryByRole("button", { name: /revoke/i })).toBeNull();
  });

  it("revoking asks first, explains it can't be undone, and cancelling sends nothing", async () => {
    const server = fakeServer({ "GET /devices": [200, { devices: DEVICES }], "POST /devices/d-k/revoke": [200, {}] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DevicesPage me={OWNER_ME} />);
    await screen.findByText("Kitchen 1");

    fireEvent.click(within(row("Kitchen 1")).getByRole("button", { name: /revoke/i }));

    expect(confirm.mock.calls[0]?.[0]).toMatch(/cannot be undone/i);
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);

    confirm.mockReturnValue(true);
    fireEvent.click(within(row("Kitchen 1")).getByRole("button", { name: /revoke/i }));
    await waitFor(() => expect(server.calls.some((c) => c.path === "/devices/d-k/revoke")).toBe(true));
  });
});
