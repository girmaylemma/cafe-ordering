import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffPage } from "../src/pages/StaffPage";
import { MANAGER_ME, fakeServer } from "./fakeServer";

const STAFF = [
  { id: "u-first", name: "Abebe", role: "manager", email: "abebe@example.com", active: true },
  { id: "u-manager", name: "Meseret", role: "manager", email: "manager@example.com", active: true },
  { id: "u-hana", name: "Hana", role: "waiter", email: null, active: true },
  { id: "u-old", name: "Dawit", role: "waiter", email: null, active: false },
];

const row = (name: string) => screen.getByText(name).closest("tr")!;

describe("StaffPage", () => {
  it("M0: a manager adds waiters only (no role choice) and has actions on waiters only", async () => {
    const team = [
      { id: "u-first", name: "Abebe", role: "manager", email: "abebe@example.com", active: true },
      { id: "u-manager", name: "Meseret", role: "manager", email: "manager@example.com", active: true },
      { id: "u-hana", name: "Hana", role: "waiter", email: null, active: true },
    ];
    const server = fakeServer({ "GET /staff": [200, { staff: team }], "POST /staff": [201, { staff: { id: "u-new" } }] });
    render(<StaffPage me={MANAGER_ME} />);
    await screen.findByText("Hana");

    expect(screen.queryByLabelText("Role")).toBeNull();
    for (const manager of ["Abebe", "Meseret"]) {
      expect(within(row(manager)).queryByRole("button", { name: "Reset PIN" }), manager).toBeNull();
      expect(within(row(manager)).queryByRole("button", { name: "Deactivate" }), manager).toBeNull();
    }
    expect(within(row("Hana")).getByRole("button", { name: "Reset PIN" })).toBeTruthy();
    expect(within(row("Hana")).getByRole("button", { name: "Deactivate" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Selam" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "4321" } });
    fireEvent.click(screen.getByRole("button", { name: "Add staff member" }));
    await waitFor(() => expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Selam", role: "waiter", pin: "4321", email: null }));
  });

  it("lists staff with role and status", async () => {
    fakeServer({ "GET /staff": [200, { staff: STAFF }] });
    render(<StaffPage me={MANAGER_ME} />);

    expect(await screen.findByText("Hana")).toBeTruthy();
    expect(within(row("Dawit")).getByText("Inactive")).toBeTruthy();
    expect(within(row("Hana")).getByText("Active")).toBeTruthy();
  });

  it("F4c: shows each person's own language, or that they follow the café's", async () => {
    fakeServer({
      "GET /staff": [
        200,
        {
          staff: [
            { ...STAFF[0], language: null },
            { ...STAFF[1], language: "om" },
            { ...STAFF[2], language: "am" },
          ],
        },
      ],
    });
    render(<StaffPage me={MANAGER_ME} />);
    await screen.findByText("Hana");

    expect(screen.getByRole("columnheader", { name: "Language" })).toBeTruthy();
    expect(within(row("Hana")).getByText("Amharic")).toBeTruthy();
    expect(within(row("Meseret")).getByText("Afaan Oromoo")).toBeTruthy();
    expect(within(row("Abebe")).getByText("Café default")).toBeTruthy();
  });

  it("creates a staff member, sends only the fields the API expects, and reloads the list", async () => {
    let created = false;
    const server = fakeServer({
      "GET /staff": () => [200, { staff: created ? [...STAFF, { id: "u-new", name: "Selam", role: "waiter", email: null, active: true }] : STAFF }],
      "POST /staff": () => {
        created = true;
        return [201, { staff: { id: "u-new" } }];
      },
    });
    render(<StaffPage me={MANAGER_ME} />);
    await screen.findByText("Hana");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Selam" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "4321" } });
    fireEvent.click(screen.getByRole("button", { name: "Add staff member" }));

    expect(await screen.findByText("Selam")).toBeTruthy();
    expect(server.calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Selam", role: "waiter", pin: "4321", email: null });
    expect((screen.getByLabelText("PIN") as HTMLInputElement).value).toBe(""); // the PIN never stays on screen
  });

  it("M1a: the new person's PIN is temporary, and the dashboard says so", async () => {
    fakeServer({ "GET /staff": [200, { staff: STAFF }], "POST /staff": [201, { staff: { id: "u-new" } }] });
    render(<StaffPage me={MANAGER_ME} />);
    await screen.findByText("Hana");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Selam" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "4321" } });
    fireEvent.click(screen.getByRole("button", { name: "Add staff member" }));

    expect((await screen.findByRole("status")).textContent).toMatch(/Selam was added\. The PIN is temporary: they choose their own at their next sign-in\./);
  });

  it("shows the server's reason when creating fails", async () => {
    fakeServer({ "GET /staff": [200, { staff: STAFF }], "POST /staff": [409, { error: "EMAIL_TAKEN" }] });
    render(<StaffPage me={MANAGER_ME} />);
    await screen.findByText("Hana");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Selam" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "4321" } });
    fireEvent.click(screen.getByRole("button", { name: "Add staff member" }));

    expect(await screen.findByText(/already used by another account/i)).toBeTruthy();
  });

  it("nobody sees a Deactivate button for themselves", async () => {
    fakeServer({ "GET /staff": [200, { staff: STAFF }] });
    render(<StaffPage me={MANAGER_ME} />);
    await screen.findByText("Hana");
    expect(within(row("Abebe")).queryByRole("button", { name: /deactivate/i })).toBeNull();
  });

  it("deactivating asks for confirmation; cancelling sends nothing", async () => {
    const server = fakeServer({ "GET /staff": [200, { staff: STAFF }], "POST /staff/u-hana/deactivate": [200, {}] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<StaffPage me={MANAGER_ME} />);
    await screen.findByText("Hana");

    fireEvent.click(within(row("Hana")).getByRole("button", { name: /deactivate/i }));

    expect(confirm).toHaveBeenCalled();
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);

    confirm.mockReturnValue(true);
    fireEvent.click(within(row("Hana")).getByRole("button", { name: /deactivate/i }));
    await waitFor(() => expect(server.calls.some((c) => c.path === "/staff/u-hana/deactivate")).toBe(true));
  });

  it("resetting a PIN sends the new PIN for that person only", async () => {
    const server = fakeServer({ "GET /staff": [200, { staff: STAFF }], "POST /staff/u-hana/pin": [200, {}] });
    vi.spyOn(window, "prompt").mockReturnValue("9876");
    render(<StaffPage me={MANAGER_ME} />);
    await screen.findByText("Hana");

    fireEvent.click(within(row("Hana")).getByRole("button", { name: /reset pin/i }));

    await waitFor(() => expect(server.calls.find((c) => c.path === "/staff/u-hana/pin")?.body).toEqual({ pin: "9876" }));
    expect(await screen.findByText(/New temporary PIN for Hana: they choose their own at their next sign-in/)).toBeTruthy();
  });
});
