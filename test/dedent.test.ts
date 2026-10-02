import { describe, expect, it } from "vitest";
import { dedent } from "./dedent.ts";

describe("dedent", () => {
  it.each([
    { name: "common indentation", input: "\n    first\n    second\n  ", expected: "first\nsecond" },
    { name: "nested indentation", input: "\n    first\n      second\n    third\n", expected: "first\n  second\nthird" },
    { name: "blank lines", input: "\n    first\n\n    second\n", expected: "first\n\nsecond" },
    { name: "unindented text", input: "first\n  second", expected: "first\n  second" },
    { name: "empty input", input: "", expected: "" },
    { name: "blank template", input: "\n    \n  ", expected: "" },
  ])("handles $name", ({ input, expected }) => {
    // Arrange
    const text = input;

    // Act
    const result = dedent(text);

    // Assert
    expect(result).toBe(expected);
  });
});
