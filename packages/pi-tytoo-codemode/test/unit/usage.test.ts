import type { Usage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { combineUsage } from "#src/usage";

function createUsage(): Usage {
  return {
    input: 1,
    output: 2,
    cacheRead: 3,
    cacheWrite: 4,
    totalTokens: 10,
    cost: { input: 5, output: 6, cacheRead: 7, cacheWrite: 8, total: 26 },
  };
}

describe("usage aggregation", () => {
  it("sums required token and cost fields without changing either input", () => {
    // Arrange
    const first = createUsage();
    const second = createUsage();
    const originalFirst = structuredClone(first);
    const originalSecond = structuredClone(second);

    // Act
    const combined = combineUsage(first, second);

    // Assert
    expect(combined).toEqual({
      input: 2,
      output: 4,
      cacheRead: 6,
      cacheWrite: 8,
      totalTokens: 20,
      cost: { input: 10, output: 12, cacheRead: 14, cacheWrite: 16, total: 52 },
    });
    expect(first).toEqual(originalFirst);
    expect(second).toEqual(originalSecond);
    expect(combined.cost).not.toBe(first.cost);
    expect(combined.cost).not.toBe(second.cost);
  });

  describe.each(["cacheWrite1h", "reasoning"] as const)("optional %s", (field) => {
    it.each([
      { name: "neither side reports it", first: undefined, second: undefined, expected: undefined },
      { name: "only the first side reports it", first: 3, second: undefined, expected: 3 },
      { name: "only the second side reports it", first: undefined, second: 4, expected: 4 },
      { name: "the first side reports zero", first: 0, second: undefined, expected: 0 },
      { name: "the second side reports zero", first: undefined, second: 0, expected: 0 },
      { name: "both sides report it", first: 3, second: 4, expected: 7 },
    ])("preserves presence and value when $name", ({ first: firstValue, second: secondValue, expected }) => {
      // Arrange
      const first = createUsage();
      const second = createUsage();
      if (firstValue !== undefined) {
        first[field] = firstValue;
      }
      if (secondValue !== undefined) {
        second[field] = secondValue;
      }

      // Act
      const combined = combineUsage(first, second);

      // Assert
      expect(Object.hasOwn(combined, field)).toBe(expected !== undefined);
      expect(combined[field]).toBe(expected);
      expect(first[field]).toBe(firstValue);
      expect(second[field]).toBe(secondValue);
    });
  });
});
