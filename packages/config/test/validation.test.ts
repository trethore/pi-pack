import { describe, expect, it } from "vitest";
import { booleanOption, unknownKeys } from "@pi-pack/config/validation";

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

describe("unknownKeys", () => {
  it("returns only unknown own enumerable keys in input order", () => {
    // Arrange
    const value: Record<string, unknown> = { known: { nested: true }, typo: "secret", constructor: true };
    Object.setPrototypeOf(value, { inherited: true });
    Object.defineProperty(value, "hidden", { value: true });

    // Act
    const keys = unknownKeys(value, ["known"]);

    // Assert
    expect(keys).toEqual(["typo", "constructor"]);
    expect(value.typo).toBe("secret");
  });

  it.each([{}, { known: true }])("returns no keys for known configuration %j", (value) => {
    // Act / Assert
    expect(unknownKeys(value, ["known"])).toEqual([]);
  });

  it("accepts objects without a prototype", () => {
    // Arrange
    const value: Record<string, unknown> = { typo: true };
    Object.setPrototypeOf(value, null);

    // Act / Assert
    expect(unknownKeys(value, [])).toEqual(["typo"]);
  });
});
