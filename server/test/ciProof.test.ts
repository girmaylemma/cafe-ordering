// THROWAWAY (CI proof): this test fails on purpose, to show CI turns red. Removed right after.
import { expect, it } from "vitest";

it("CI catches a failing test", () => {
  expect(1 + 1).toBe(3);
});
