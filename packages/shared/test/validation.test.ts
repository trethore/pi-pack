import { describe, expect, it } from "vitest";
import { booleanOption } from "../src/validation.ts";

describe("booleanOption", () => {
  it.each([true, false])("uses fallback %s only for undefined", (fallback) => {
    // Act / Assert
    expect(booleanOption(undefined, "enabled", fallback)).toBe(fallback);
    expect(booleanOption(true, "enabled", fallback)).toBe(true);
    expect(booleanOption(false, "enabled", fallback)).toBe(false);
  });

  it.each([null, 0, 1, "true", [], {}])("rejects nonboolean value %j", (value) => {
    // Act / Assert
    expect(() => booleanOption(value, "enabled", true)).toThrow("enabled must be a boolean");
  });
});
