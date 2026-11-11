import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { TablesPage } from "../src/pages/TablesPage";
import { OWNER_ME, fakeServer } from "./fakeServer";

const TABLES = [
  { id: "t7", name: "Table 7", area: "Terrace", seats: 4, sortOrder: 0, active: true },
  { id: "t8", name: "Table 8", area: null, seats: null, sortOrder: 1, active: false },
];
const row = (name: string) => screen.getByText(name).closest("tr")!;

describe("TablesPage", () => {
  it("lists tables with area, seats and status", async () => {
    fakeServer({ "GET /tables": [200, { tables: TABLES }] });
    render(<TablesPage me={OWNER_ME} />);

    expect(await screen.findByText("Table 7")).toBeTruthy();
    expect(within(row("Table 7")).getByText("Terrace")).toBeTruthy();
    expect(within(row("Table 7")).getByText("4")).toBeTruthy();
    expect(within(row("Table 8")).getByText("Inactive")).toBeTruthy();
  });

  it("adds a table; empty area and seats are sent as null", async () => {
    const s = fakeServer({ "GET /tables": [200, { tables: [] }], "POST /tables": [201, { table: { id: "t9" } }] });
    render(<TablesPage me={OWNER_ME} />);
    await screen.findByRole("heading", { name: "Tables" });

    fireEvent.change(screen.getByLabelText("Table name"), { target: { value: "Table 9" } });
    fireEvent.click(screen.getByRole("button", { name: "Add table" }));

    await waitFor(() => expect(s.calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Table 9", area: null, seats: null, sortOrder: 0 }));
  });

  it("editing sends only what changed", async () => {
    const s = fakeServer({ "GET /tables": [200, { tables: TABLES }], "PATCH /tables/t7": [200, { table: {} }] });
    render(<TablesPage me={OWNER_ME} />);
    await screen.findByText("Table 7");

    fireEvent.click(within(row("Table 7")).getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Seats (optional)"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(s.calls.find((c) => c.method === "PATCH")?.body).toEqual({ seats: 6 }));
  });

  it("deactivating asks first; if guests are seated, the server's refusal is explained", async () => {
    fakeServer({ "GET /tables": [200, { tables: TABLES }], "PATCH /tables/t7": [409, { error: "TABLE_IN_USE" }] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TablesPage me={OWNER_ME} />);
    await screen.findByText("Table 7");

    fireEvent.click(within(row("Table 7")).getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText(/guests are seated at this table/i)).toBeTruthy();
  });
});

describe("navigation", () => {
  it("the dashboard has Menu, Options and Tables pages", async () => {
    fakeServer({ "GET /me": [200, OWNER_ME], "GET /staff": [200, { staff: [] }] });
    render(<App />);
    await screen.findByText("Abebe Cafe");
    const nav = screen.getByRole("navigation");
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Staff", "Tablets", "Menu", "Options", "Tables"]);
  });
});
