import { describe, expect, it } from "vitest";
import { ToolMasks } from "../src/masks.ts";

describe("tool masks", () => {
  it.each([
    ["read", "read", true],
    ["read", "codemode.read", false],
    ["read", "reader", false],
    ["*read", "mcp__read", true],
    ["*read", "reader", false],
    ["read*", "reader", true],
    ["read*", "mcp__read", false],
    ["*read*", "mcp__reader", true],
    ["*read*", "bash", false],
    ["*", "read", true],
    ["*", "codemode.read", true],
    ["codemode.*", "read", false],
    ["codemode.*", "codemode.read", true],
    ["?read", "bread", true],
    ["?read", "read", false],
    ["?read", "thread", false],
    ["*?read", "read", false],
    ["*?read", "thread", true],
    ["codemode.read", "codemodeXread", false],
    ["tool[1]+", "tool[1]+", true],
    ["tool[1]+", "tool11", false],
    ["tool\\name", "tool\\name", true],
    ["read", "Read", false],
    ["!read", "read", false],
  ])("%s matches %s: %s", (pattern, name, expected) => {
    // Arrange
    const masks = new ToolMasks({ enabled: true, enforceBeforeAgentStart: false, masks: [pattern] });

    // Act
    const masked = masks.isMasked(name);

    // Assert
    expect(masked).toBe(expected);
  });

  it.each([
    { patterns: ["*", "!read"], name: "read", masked: false },
    { patterns: ["*", "!read"], name: "codemode.read", masked: true },
    { patterns: ["*", "!read", "read"], name: "read", masked: true },
    { patterns: ["codemode.*", "!codemode.read"], name: "codemode.read", masked: false },
    { patterns: ["read", "!codemode.read"], name: "read", masked: true },
    { patterns: ["*", "!*read*"], name: "codemode.read", masked: false },
    { patterns: [], name: "read", masked: false },
  ])("uses last matching rule for $patterns and $name", ({ patterns, name, masked }) => {
    // Arrange
    const masks = new ToolMasks({ enabled: true, enforceBeforeAgentStart: false, masks: patterns });

    // Act
    const result = masks.isMasked(name);

    // Assert
    expect(result).toBe(masked);
  });

  it("ignores masks when disabled", () => {
    // Arrange
    const masks = new ToolMasks({ enabled: false, enforceBeforeAgentStart: true, masks: ["*"] });

    // Act / Assert
    expect(masks.isMasked("read")).toBe(false);
    expect(masks.isMasked("codemode.read")).toBe(false);
  });
});
