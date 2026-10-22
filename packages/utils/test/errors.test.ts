import { describe, expect, it } from "vitest";
import { errorMessage } from "@pi-pack/utils/errors";

describe("errorMessage", () => {
  it.each(["failure", ""])("preserves Error message %j even with a fallback", (message) => {
    // Arrange
    const error = new TypeError(message);

    // Act / Assert
    expect(errorMessage(error)).toBe(message);
    expect(errorMessage(error, "Fallback")).toBe(message);
  });

  it.each([
    { value: "failure", expected: "failure" },
    { value: undefined, expected: "undefined" },
    { value: null, expected: "null" },
    { value: 42, expected: "42" },
    { value: false, expected: "false" },
    { value: Symbol("failure"), expected: "Symbol(failure)" },
    { value: { message: "not an Error" }, expected: "[object Object]" },
  ])("converts $value to a string without a fallback", ({ value, expected }) => {
    // Act / Assert
    expect(errorMessage(value)).toBe(expected);
  });

  it.each(["Fallback", ""])("uses explicit fallback %j without coercing non-Errors", (fallback) => {
    // Arrange
    const error = {
      toString() {
        throw new Error("Must not coerce");
      },
    };

    // Act / Assert
    expect(errorMessage(error, fallback)).toBe(fallback);
  });
});
