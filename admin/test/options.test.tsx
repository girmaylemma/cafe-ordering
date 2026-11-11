import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OptionsPage } from "../src/pages/OptionsPage";
import { OWNER_ME, fakeServer } from "./fakeServer";

const GROUPS = [
  {
    id: "g-size", nameEn: "Size", nameAm: "መጠን", minChoices: 1, maxChoices: 1, sortOrder: 0, active: true,
    options: [
      { id: "o-small", groupId: "g-size", nameEn: "Small", nameAm: null, extra: "0.00", extraSantim: 0, sortOrder: 0, active: true },
      { id: "o-large", groupId: "g-size", nameEn: "Large", nameAm: "ትልቅ", extra: "15.00", extraSantim: 1500, sortOrder: 0, active: true },
    ],
  },
  { id: "g-extras", nameEn: "Extras", nameAm: null, minChoices: 0, maxChoices: 2, sortOrder: 1, active: true, options: [] },
  { id: "g-spice", nameEn: "Spice", nameAm: null, minChoices: 1, maxChoices: 2, sortOrder: 2, active: true, options: [] },
];

const group = (testId: string) => screen.getByTestId(testId);
const optionRow = (name: string) => screen.getByText(name).closest("tr")!;

describe("OptionsPage", () => {
  it("shows each group's rule in words and each option's extra", async () => {
    fakeServer({ "GET /option-groups": [200, { groups: GROUPS }] });
    render(<OptionsPage me={OWNER_ME} />);

    expect(within(await screen.findByTestId("group-g-size")).getByText("Choose exactly 1")).toBeTruthy();
    expect(within(group("group-g-extras")).getByText("Optional: up to 2")).toBeTruthy();
    expect(within(group("group-g-spice")).getByText("Choose 1 to 2")).toBeTruthy();
    expect(within(optionRow("Small")).getByText("free")).toBeTruthy();
    expect(within(optionRow("Large")).getByText("+15.00 ETB")).toBeTruthy();
  });

  it("adds a group; a minimum above the maximum is refused in the page", async () => {
    const s = fakeServer({ "GET /option-groups": [200, { groups: [] }], "POST /option-groups": [201, { group: { id: "g-new" } }] });
    render(<OptionsPage me={OWNER_ME} />);
    await screen.findByRole("heading", { name: "Options" });

    fireEvent.change(screen.getByLabelText("Group name (English)"), { target: { value: "Milk" } });
    fireEvent.change(screen.getByLabelText("At least"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("At most"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    expect(await screen.findByText(/at least.*can't be more than.*at most/i)).toBeTruthy();
    expect(s.calls.some((c) => c.method === "POST")).toBe(false);

    fireEvent.change(screen.getByLabelText("At least"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    await waitFor(() => expect(s.calls.find((c) => c.method === "POST")?.body).toEqual({ nameEn: "Milk", nameAm: null, minChoices: 0, maxChoices: 1 }));
  });

  it("adds an option to a group with its extra as text; a badly written extra is refused in the page", async () => {
    const s = fakeServer({ "GET /option-groups": [200, { groups: GROUPS }], "POST /option-groups/g-extras/options": [201, { option: { id: "o-new" } }] });
    render(<OptionsPage me={OWNER_ME} />);
    const extras = await screen.findByTestId("group-g-extras");

    fireEvent.change(within(extras).getByLabelText("New option (English)"), { target: { value: "Honey" } });
    fireEvent.change(within(extras).getByLabelText("Extra (ETB)"), { target: { value: "1,5" } });
    fireEvent.click(within(extras).getByRole("button", { name: "Add option" }));
    expect(await screen.findByText(/price like 180 or 42.50/i)).toBeTruthy();

    fireEvent.change(within(extras).getByLabelText("Extra (ETB)"), { target: { value: "5" } });
    fireEvent.click(within(extras).getByRole("button", { name: "Add option" }));
    await waitFor(() => expect(s.calls.find((c) => c.method === "POST")?.body).toEqual({ nameEn: "Honey", nameAm: null, extra: "5" }));
  });

  it("deactivating an option asks first, then sends active: false", async () => {
    const s = fakeServer({ "GET /option-groups": [200, { groups: GROUPS }], "PATCH /options/o-large": [200, { option: {} }] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<OptionsPage me={OWNER_ME} />);
    await screen.findByTestId("group-g-size");

    fireEvent.click(within(optionRow("Large")).getByRole("button", { name: "Deactivate" }));

    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(s.calls.find((c) => c.method === "PATCH")?.body).toEqual({ active: false }));
  });
});
