import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Without vitest globals, Testing Library can't register its own cleanup: do it here.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "";
});
