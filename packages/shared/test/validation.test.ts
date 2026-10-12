import { describe, expect, it } from "vitest";
import { booleanOption, isObject, unknownKeys } from "@pi-pack/shared/validation";

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
