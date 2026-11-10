import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { api, ApiError } from "../src/api";
import { App } from "../src/App";
import { OWNER_ME, fakeServer } from "./fakeServer";

describe("api()", () => {
  it("sends JSON with the same-origin credentials, and returns the parsed body", async () => {
    const server = fakeServer({ "POST /staff": [201, { staff: { id: "s1" } }] });

    const result = await api<{ staff: { id: string } }>("POST", "/staff", { name: "Hana" });

    expect(result).toEqual({ staff: { id: "s1" } });
    expect(server.calls[0]).toMatchObject({ method: "POST", path: "/staff", body: { name: "Hana" }, headers: { "content-type": "application/json" } });
  });

  it("turns an error response into an ApiError with the server's code", async () => {
    fakeServer({ "POST /staff": [409, { error: "EMAIL_TAKEN" }] });
    await expect(api("POST", "/staff", {})).rejects.toEqual(new ApiError(409, "EMAIL_TAKEN"));
  });
});

describe("App shell", () => {
  it("shows the café, the signed-in person and the navigation", async () => {
    fakeServer({ "GET /me": [200, OWNER_ME], "GET /staff": [200, { staff: [] }] });

    render(<App />);

    expect(await screen.findByText("Abebe Cafe")).toBeTruthy();
    expect(screen.getByText("Abebe (owner)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Staff" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tablets" })).toBeTruthy();
  });

  it("explains a 403: this email has no dashboard access", async () => {
    fakeServer({ "GET /me": [403, { error: "FORBIDDEN" }] });
    render(<App />);
    expect(await screen.findByText(/no access to the dashboard/i)).toBeTruthy();
  });

  it("switches pages from the navigation and remembers the page in the address", async () => {
    fakeServer({ "GET /me": [200, OWNER_ME], "GET /staff": [200, { staff: [] }], "GET /devices": [200, { devices: [] }] });
    render(<App />);
    await screen.findByText("Abebe Cafe");

    fireEvent.click(screen.getByRole("button", { name: "Tablets" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Tablets" })).toBeTruthy());
    expect(window.location.hash).toBe("#tablets");
  });
});
