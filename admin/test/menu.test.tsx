import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MenuPage } from "../src/pages/MenuPage";
import { OWNER_ME, fakeServer } from "./fakeServer";

const CATEGORIES = [
  { id: "c-food", nameEn: "Food", nameAm: "ምግብ", sortOrder: 1, active: true },
  { id: "c-drinks", nameEn: "Drinks", nameAm: null, sortOrder: 2, active: true },
  { id: "c-old", nameEn: "Old specials", nameAm: null, sortOrder: 3, active: false },
];
const ITEMS = [
  { id: "i-shiro", categoryId: "c-food", nameEn: "Shiro", nameAm: "ሽሮ", price: "180.00", priceSantim: 18000, stationId: "kitchen", fasting: true, soldOut: false, sortOrder: 0, active: true, optionGroupIds: [] },
  { id: "i-tibs", categoryId: "c-food", nameEn: "Tibs", nameAm: null, price: "320.00", priceSantim: 32000, stationId: "kitchen", fasting: false, soldOut: true, sortOrder: 1, active: true, optionGroupIds: [] },
  { id: "i-mac", categoryId: "c-drinks", nameEn: "Macchiato", nameAm: null, price: "42.50", priceSantim: 4250, stationId: "bar", fasting: false, soldOut: false, sortOrder: 0, active: true, optionGroupIds: ["g-size"] },
];

const GROUPS = [
  { id: "g-size", nameEn: "Size", nameAm: null, minChoices: 1, maxChoices: 1, sortOrder: 0, active: true, options: [] },
  { id: "g-old", nameEn: "Old group", nameAm: null, minChoices: 0, maxChoices: 1, sortOrder: 1, active: false, options: [] },
];

function server(extra: Parameters<typeof fakeServer>[0] = {}) {
  return fakeServer({
    "GET /categories": [200, { categories: CATEGORIES }],
    "GET /menu-items": [200, { items: ITEMS }],
    "GET /option-groups": [200, { groups: GROUPS }],
    ...extra,
  });
}

const itemRow = (name: string) => screen.getByText(name).closest("tr")!;
const categoryRow = (name: string) => within(screen.getByTestId("categories")).getByText(name).closest("tr")!;

describe("MenuPage: list", () => {
  it("shows items under their category with both names, price in ETB, station and fasting", async () => {
    server();
    render(<MenuPage me={OWNER_ME} />);

    const food = await screen.findByTestId("items-c-food");
    expect(within(food).getByText("Shiro")).toBeTruthy();
    expect(within(food).getByText("ሽሮ")).toBeTruthy();
    expect(within(itemRow("Shiro")).getByText("180.00 ETB")).toBeTruthy();
    expect(within(itemRow("Shiro")).getByText("Kitchen")).toBeTruthy();
    expect(within(itemRow("Shiro")).getByText("Fasting")).toBeTruthy();
    expect(within(screen.getByTestId("items-c-drinks")).getByText("Macchiato")).toBeTruthy();
    expect(within(itemRow("Macchiato")).getByText("Bar")).toBeTruthy();
  });
});

describe("MenuPage: categories", () => {
  it("adds a category; an empty Amharic name is sent as null", async () => {
    const s = server({ "POST /categories": [201, { category: { id: "c-new" } }] });
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    fireEvent.change(screen.getByLabelText("Category name (English)"), { target: { value: "Breakfast" } });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() => expect(s.calls.find((c) => c.method === "POST")?.body).toEqual({ nameEn: "Breakfast", nameAm: null, sortOrder: 0 }));
  });

  it("deactivating asks first and says how many active items leave the tablets; cancelling sends nothing", async () => {
    const s = server({ "PATCH /categories/c-food": [200, { category: {} }] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    fireEvent.click(within(categoryRow("Food")).getByRole("button", { name: "Deactivate" }));

    expect(confirm.mock.calls[0]?.[0]).toMatch(/2 active items/);
    expect(s.calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("reactivating a category sends active: true without asking", async () => {
    const s = server({ "PATCH /categories/c-old": [200, { category: {} }] });
    const confirm = vi.spyOn(window, "confirm");
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    fireEvent.click(within(categoryRow("Old specials")).getByRole("button", { name: "Reactivate" }));

    await waitFor(() => expect(s.calls.find((c) => c.method === "PATCH")?.body).toEqual({ active: true }));
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("MenuPage: items", () => {
  it("adds an item with the price as text (never a number), the station and the fasting tag", async () => {
    const s = server({ "POST /menu-items": [201, { item: { id: "i-new" } }] });
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "c-drinks" } });
    fireEvent.change(screen.getByLabelText("Item name (English)"), { target: { value: "Spris" } });
    fireEvent.change(screen.getByLabelText("Item name (Amharic, optional)"), { target: { value: "ስፕሪስ" } });
    fireEvent.change(screen.getByLabelText("Price (ETB)"), { target: { value: "55.5" } });
    fireEvent.change(screen.getByLabelText("Station"), { target: { value: "bar" } });
    fireEvent.click(screen.getByLabelText("Fasting (ጾም)"));
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() =>
      expect(s.calls.find((c) => c.method === "POST")?.body).toEqual({
        categoryId: "c-drinks",
        nameEn: "Spris",
        nameAm: "ስፕሪስ",
        price: "55.5",
        stationId: "bar",
        fasting: true,
        sortOrder: 0,
        optionGroupIds: [],
      }),
    );
  });

  it("refuses a badly written price before sending anything", async () => {
    const s = server();
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    fireEvent.change(screen.getByLabelText("Item name (English)"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Price (ETB)"), { target: { value: "12,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText(/price like 180 or 42.50/i)).toBeTruthy();
    expect(s.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("the category choice offers active categories only", async () => {
    server();
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    const options = within(screen.getByLabelText("Category")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Food", "Drinks"]);
  });

  it("editing fills the form and sends only the fields that changed", async () => {
    const s = server({ "PATCH /menu-items/i-shiro": [200, { item: {} }] });
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    fireEvent.click(within(itemRow("Shiro")).getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("Price (ETB)") as HTMLInputElement).value).toBe("180.00");
    fireEvent.change(screen.getByLabelText("Price (ETB)"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(s.calls.find((c) => c.method === "PATCH")?.body).toEqual({ price: "200" }));
  });

  it("shows the server's reason when saving fails", async () => {
    server({ "POST /menu-items": [400, { error: "INVALID_INPUT" }] });
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    fireEvent.change(screen.getByLabelText("Item name (English)"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Price (ETB)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText(/please check the form/i)).toBeTruthy();
  });
});

describe("MenuPage: sold out and option groups", () => {
  it("marks an item sold out from its row, and offers 'Back in stock' for a sold-out one", async () => {
    const s = server({ "PATCH /menu-items/i-shiro": [200, { item: {} }] });
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    expect(within(itemRow("Tibs")).getByText("Sold out")).toBeTruthy();
    expect(within(itemRow("Tibs")).getByRole("button", { name: "Back in stock" })).toBeTruthy();

    fireEvent.click(within(itemRow("Shiro")).getByRole("button", { name: "Mark sold out" }));

    await waitFor(() => expect(s.calls.find((c) => c.method === "PATCH")?.body).toEqual({ soldOut: true }));
  });

  it("the item form lists active option groups to attach; adding sends the chosen ids", async () => {
    const s = server({ "POST /menu-items": [201, { item: { id: "i-new" } }] });
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    expect(screen.queryByLabelText("Old group")).toBeNull();
    fireEvent.change(screen.getByLabelText("Item name (English)"), { target: { value: "Latte" } });
    fireEvent.change(screen.getByLabelText("Price (ETB)"), { target: { value: "50" } });
    fireEvent.click(screen.getByLabelText("Size"));
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect((s.calls.find((c) => c.method === "POST")?.body as { optionGroupIds: string[] }).optionGroupIds).toEqual(["g-size"]));
  });

  it("editing an item with groups doesn't resend unchanged groups (arrays compared by content)", async () => {
    const s = server({ "PATCH /menu-items/i-mac": [200, { item: {} }] });
    render(<MenuPage me={OWNER_ME} />);
    await screen.findByTestId("items-c-food");

    fireEvent.click(within(itemRow("Macchiato")).getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("Size") as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Price (ETB)"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(s.calls.find((c) => c.method === "PATCH")?.body).toEqual({ price: "45" }));
  });
});
