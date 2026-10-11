import { describe, expect, it } from "vitest";
import { harness, resultText } from "#test/support/harness";

describe("session storage", () => {
  it("persists successful writes and uses the selected session branch", async () => {
    // Arrange
    const test = harness();

    // Act
    await test.run('store("counter", 1)');
    const next = await test.run('store("counter", load("counter") + 1); return load("counter")');
    test.switchBranch([]);
    const otherBranch = await test.run('return typeof load("counter")');

    // Assert
    expect(test.appendEntry).toHaveBeenCalledWith("codemode-store", { set: { counter: 2 }, delete: [] });
    expect(next.isError).toBeUndefined();
    expect(next.content.slice(1)).toEqual([{ type: "text", text: "2" }]);
    expect(otherBranch.isError).toBeUndefined();
    expect(otherBranch.content.slice(1)).toEqual([{ type: "text", text: "undefined" }]);
  });

  it("keeps partial output but never commits failed writes", async () => {
    // Arrange
    const test = harness();

    // Act
    const result = await test.run('store("key", 1); text("partial"); throw new Error("failed")');

    // Assert
    expect(test.appendEntry).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("partial");
  });
});
