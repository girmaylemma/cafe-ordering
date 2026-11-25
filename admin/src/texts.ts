/**
 * Every text the dashboard shows, in one place, so Amharic can be added later without touching
 * the screens (D-72). English only for now.
 */
import { ApiError } from "./api";

export const roleLabel: Record<string, string> = { waiter: "Waiter", manager: "Manager" };
export const stationLabel: Record<string, string> = { kitchen: "Kitchen", bar: "Bar" };
/** A language as the staff list names it (F4c). */
export const languageName: Record<string, string> = { en: "English", am: "Amharic", om: "Afaan Oromoo", ti: "Tigrinya" };

/**
 * The café-language choices: each in its own name too, so a manager finds theirs. Afaan Oromoo and
 * Tigrinya texts are drafts until a native speaker reviews them (D-94): say so, so nobody picks
 * them for a café without knowing.
 */
export const languageOption: Record<string, string> = {
  en: "English",
  am: "አማርኛ (Amharic)",
  om: "Afaan Oromoo (Oromo) — draft, not reviewed yet",
  ti: "ትግርኛ (Tigrinya) — draft, not reviewed yet",
};

export const deviceStatusLabel: Record<string, string> = { paired: "Paired", unpaired: "Not paired yet", revoked: "Revoked" };

const errors: Record<string, string> = {
  UNAUTHENTICATED: "Your login has expired. Reload the page to sign in again.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "Not found. Someone may have changed it; reload the page.",
  INVALID_INPUT: "Please check the form: something is missing or not valid.",
  INVALID_REQUEST: "Please check the form: something is missing or not valid.",
  INVALID_PIN: "The PIN must be 4–6 digits (managers: exactly 6).",
  EMAIL_TAKEN: "This email is already used by another account.",
  CANNOT_DEACTIVATE_SELF: "You can't deactivate yourself.",
  ALREADY_PAIRED: "This tablet is already paired.",
  DEVICE_REVOKED: "This tablet was revoked. Add it again as a new tablet.",
  TABLE_IN_USE: "Guests are seated at this table. Close it first.",
  INVALID_CREDENTIALS: "The current password is not right.",
  INVALID_PASSWORD: "A password needs 8 to 128 characters, with a letter, a number and a symbol.",
  SAME_PASSWORD: "Choose a password different from the current one.",
  LOCKED: "Too many wrong passwords. Try again in 5 minutes.",
};

/** A sentence a manager can act on, for any error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return errors[error.code] ?? `Something went wrong (${error.code}). Please try again.`;
  return "Could not reach the server. Check the internet connection and try again.";
}

export const priceFormatMessage = "Write the price like 180 or 42.50 (ETB, at most 2 decimals).";
export const orderFormatMessage = "The order must be a whole number from 0 to 9999.";
export const seatsFormatMessage = "Seats must be a whole number from 1 to 99, or empty.";
export const minMaxMessage = "“At least” can't be more than “At most”, and “At most” must be 1 to 10.";

export const noAccessMessage =
  "This email has no access to the dashboard. Ask the system's developer to add you as a manager with this email.";
