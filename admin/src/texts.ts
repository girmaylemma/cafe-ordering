/**
 * Every text the dashboard shows, in one place, so Amharic can be added later without touching
 * the screens (D-72). English only for now.
 */
import { ApiError } from "./api";

export const roleLabel: Record<string, string> = { waiter: "Waiter", manager: "Manager", owner: "Owner" };
export const stationLabel: Record<string, string> = { kitchen: "Kitchen", bar: "Bar" };
export const deviceStatusLabel: Record<string, string> = { paired: "Paired", unpaired: "Not paired yet", revoked: "Revoked" };

const errors: Record<string, string> = {
  UNAUTHENTICATED: "Your login has expired. Reload the page to sign in again.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "Not found. Someone may have changed it; reload the page.",
  INVALID_INPUT: "Please check the form: something is missing or not valid.",
  INVALID_REQUEST: "Please check the form: something is missing or not valid.",
  INVALID_PIN: "The PIN must be 4–6 digits (managers and owners: exactly 6).",
  EMAIL_TAKEN: "This email is already used by another account.",
  CANNOT_DEACTIVATE_SELF: "You can't deactivate yourself.",
  ALREADY_PAIRED: "This tablet is already paired.",
  DEVICE_REVOKED: "This tablet was revoked. Add it again as a new tablet.",
  TABLE_IN_USE: "Guests are seated at this table. Close it first.",
};

/** A sentence a manager can act on, for any error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return errors[error.code] ?? `Something went wrong (${error.code}). Please try again.`;
  return "Could not reach the server. Check the internet connection and try again.";
}

export const noAccessMessage =
  "This email has no access to the dashboard. Ask the café owner to add you as a manager with this email.";
