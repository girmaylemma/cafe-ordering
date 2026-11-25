import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("Your password (M1b)", () => {
  const withPassword = { ...MANAGER_ME, user: { ...MANAGER_ME.user, hasPassword: true } };
  const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
  const savePassword = () => screen.getByRole("button", { name: "Save password" }) as HTMLButtonElement;
  async function open(me: typeof MANAGER_ME, reply: [number, unknown] = [200, {}]) {
    const server = fakeServer({ "GET /venue": [200, venue("en")], "PUT /me/password": reply });
    render(<SettingsPage me={me} />);
    await screen.findByText("Your password");
    return server;
  }
  const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });

  it("the first password: no current one asked; Save sends only the new one; the fields are emptied", async () => {
    const server = await open(MANAGER_ME);
    expect(screen.queryByLabelText("Current password")).toBeNull();

    type("New password", "first-password-1");
    type("New password again", "first-password-1");
    fireEvent.click(savePassword());

    expect((await screen.findByText("Your password is saved."))).toBeTruthy();
    expect(server.calls.find((c) => c.method === "PUT")?.body).toEqual({ newPassword: "first-password-1" });
    expect(field("New password").value).toBe("");
    expect(field("New password again").value).toBe("");
  });

  it("changing it: the current password is asked for and sent", async () => {
    const server = await open(withPassword);

    type("Current password", "first-password-1");
    type("New password", "second-password-2");
    type("New password again", "second-password-2");
    fireEvent.click(savePassword());

    await waitFor(() => expect(server.calls.find((c) => c.method === "PUT")?.body).toEqual({ currentPassword: "first-password-1", newPassword: "second-password-2" }));
  });

  it("two different new passwords: says so, nothing is sent", async () => {
    const server = await open(MANAGER_ME);

    type("New password", "first-password-1");
    type("New password again", "first-password-2");
    fireEvent.click(savePassword());

    expect(await screen.findByText("The two passwords are not the same.")).toBeTruthy();
    expect(server.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("Save password stays off until the new password has 10 characters", async () => {
    await open(MANAGER_ME);

    type("New password", "123456789");
    type("New password again", "123456789");
    expect(savePassword().disabled).toBe(true);
    type("New password", "1234567890");
    type("New password again", "1234567890");
    expect(savePassword().disabled).toBe(false);
  });

  it("too short: says how many characters are needed, while typing", async () => {
    await open(MANAGER_ME);

    type("New password", "short123");

    expect(screen.getByText("At least 10 characters (8 so far).")).toBeTruthy();
    type("New password", "long-enough-1");
    expect(screen.queryByText(/At least 10 characters \(/)).toBeNull();
  });

  it("Show passwords reveals all three fields, and they are hidden again after a save", async () => {
    await open(withPassword);
    const kinds = () => ["Current password", "New password", "New password again"].map((label) => field(label).type);
    expect(kinds()).toEqual(["password", "password", "password"]);

    fireEvent.click(screen.getByLabelText("Show passwords"));
    expect(kinds()).toEqual(["text", "text", "text"]);

    type("Current password", "first-password-1");
    type("New password", "second-password-2");
    type("New password again", "second-password-2");
    fireEvent.click(savePassword());
    await screen.findByText("Your password is saved.");

    expect(kinds()).toEqual(["password", "password", "password"]);
    expect((screen.getByLabelText("Show passwords") as HTMLInputElement).checked).toBe(false);
  });

  it("a refusal says why and clears every password field", async () => {
    await open(withPassword, [403, { error: "INVALID_CREDENTIALS" }]);

    type("Current password", "wrong-password-0");
    type("New password", "second-password-2");
    type("New password again", "second-password-2");
    fireEvent.click(savePassword());

    expect((await screen.findByRole("alert")).textContent).toBe("The current password is not right.");
    for (const label of ["Current password", "New password", "New password again"]) expect(field(label).value, label).toBe("");
  });
});
