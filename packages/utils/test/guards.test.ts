import { describe, expect, it } from "vitest";
import { isObject } from "@pi-pack/utils/guards";

describe("isObject", () => {
  it("accepts non-array objects without restricting their prototype", () => {
    // Act / Assert
    expect(isObject({})).toBe(true);
    expect(isObject({ enabled: true })).toBe(true);
    expect(isObject(Object.create(null))).toBe(true);
    expect(isObject(new Date(0))).toBe(true);
  });

  it.each([undefined, null, true, false, 0, "text", [], [1], () => {}].map((value) => ({ value })))(
    "rejects $value",
    ({ value }) => {
      // Act / Assert
      expect(isObject(value)).toBe(false);
    },
  );
});
