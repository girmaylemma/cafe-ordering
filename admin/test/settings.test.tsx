import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsPage } from "../src/pages/SettingsPage";
import { MANAGER_ME, fakeServer } from "./fakeServer";

const venue = (language: string) => ({ venue: { id: "v-1", name: "Abebe Cafe", language } });
const select = () => screen.getByLabelText("Café language") as HTMLSelectElement;
const save = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;

describe("SettingsPage (F4c)", () => {
  it("shows the café's current language", async () => {
    fakeServer({ "GET /venue": [200, venue("am")] });
    render(<SettingsPage me={MANAGER_ME} />);

    await screen.findByLabelText("Café language");
    expect(select().value).toBe("am");
  });

  it("offers all four languages; Afaan Oromoo and Tigrinya are marked as drafts", async () => {
    fakeServer({ "GET /venue": [200, venue("en")] });
    render(<SettingsPage me={MANAGER_ME} />);
    await screen.findByLabelText("Café language");

    const options = Array.from(select().options).map((o) => [o.value, o.textContent]);
    expect(options.map(([value]) => value)).toEqual(["en", "am", "om", "ti"]);
    for (const [value, label] of options) {
      expect(label?.includes("draft"), `${value}: ${label}`).toBe(value === "om" || value === "ti");
    }
  });

  it("Save sends only the language, says it is saved and when tablets switch", async () => {
    const server = fakeServer({ "GET /venue": [200, venue("en")], "PATCH /venue": (body) => [200, venue((body as { language: string }).language)] });
    render(<SettingsPage me={MANAGER_ME} />);
    await screen.findByLabelText("Café language");

    fireEvent.change(select(), { target: { value: "ti" } });
    fireEvent.click(save());

    expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringMatching(/Saved.*next time they start or reconnect/));
    expect(server.calls.find((c) => c.method === "PATCH")?.body).toEqual({ language: "ti" });
    expect(select().value).toBe("ti");
  });

  it("Save is disabled until the language is changed", async () => {
    fakeServer({ "GET /venue": [200, venue("am")] });
    render(<SettingsPage me={MANAGER_ME} />);
    await screen.findByLabelText("Café language");

    expect(save().disabled).toBe(true);
    fireEvent.change(select(), { target: { value: "en" } });
    expect(save().disabled).toBe(false);
    fireEvent.change(select(), { target: { value: "am" } });
    expect(save().disabled).toBe(true);
  });

  it("a refused save shows the reason and keeps the choice on screen", async () => {
    fakeServer({ "GET /venue": [200, venue("en")], "PATCH /venue": [403, { error: "FORBIDDEN" }] });
    render(<SettingsPage me={MANAGER_ME} />);
    await screen.findByLabelText("Café language");

    fireEvent.change(select(), { target: { value: "om" } });
    fireEvent.click(save());

    expect((await screen.findByRole("alert")).textContent).toBe("You don't have permission to do that.");
    expect(select().value).toBe("om");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a failed load shows the reason (no form to save over)", async () => {
    fakeServer({ "GET /venue": [404, { error: "NOT_FOUND" }] });
    render(<SettingsPage me={MANAGER_ME} />);

    expect((await screen.findByRole("alert")).textContent).toMatch(/Not found/);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
