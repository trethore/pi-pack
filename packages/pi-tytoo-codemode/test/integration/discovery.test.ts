import { describe, expect, it } from "vitest";
import { harness, sampleTool, resultText } from "#test/support/harness";
import { createCodemodeToolDefinition } from "#src/tool";
import type { ToolLoadout } from "@earendil-works/pi-coding-agent";

describe("discovery", () => {
  it("finds callable tools and describes namespace instructions", async () => {
    // Arrange
    const test = harness([sampleTool("mcp__docs__search")], {
      getToolNamespace: () => ({ name: "mcp__docs", instructions: "Read documentation before editing" }),
      getToolGuidelines: () => new Map([["mcp__docs__search", ["Use narrow queries"]]]),
    });
    // Act
    const result = await test.run(
      `return { matches: await searchTools("search", { namespace: "docs" }), tool: await describeTool("mcp__docs__search"), namespace: await describeNamespace("docs") }`,
    );
    // Assert
    const text = resultText(result);
    expect(text).toContain("mcp__docs__search");
    expect(text).toContain("Read documentation before editing");
    expect(text).toContain("Use narrow queries");
  });

  it("hides deferred declarations and supports codemode-only loadouts", () => {
    // Arrange
    const tools = [sampleTool("direct"), sampleTool("deferred")];
    const test = harness(tools, { getMode: () => "only" });
    const definition = createCodemodeToolDefinition(test.options);
    const loadout: ToolLoadout = {
      declared: tools.slice(0, 1),
      callable: tools,
      registered: tools,
      getExposure: (name) => (name === "direct" ? "direct" : "deferred"),
      getNamespace: () => undefined,
      getPromptGuidelines: () => [],
    };
    // Act
    const changes = definition.prepareLoadout?.(loadout);
    // Assert
    expect(changes?.hiddenDeclarations).toEqual(["direct"]);
    expect(changes?.descriptions?.codemode).toContain("direct(args:");
    expect(changes?.descriptions?.codemode).not.toContain("deferred(args:");
  });
});
