import { describe, expect, it } from "vitest";
import { harness, sampleTool } from "#test/support/harness";
import { createCodemodeToolDefinition } from "#src/tool";
import type { ToolLoadout } from "@earendil-works/pi-coding-agent";

describe("discovery", () => {
  it("finds callable tools and describes namespace instructions", async () => {
    // Arrange
    const toolName = "mcp__docs__search";
    const test = harness([sampleTool(toolName)], {
      getToolNamespace: () => ({ name: "mcp__docs", instructions: "Read documentation before editing" }),
      getToolGuidelines: () => new Map([[toolName, ["Use narrow queries"]]]),
    });

    // Act
    const result = await test.run(
      `return { matches: await searchTools("search", { namespace: "docs" }), tool: await describeTool("${toolName}"), namespace: await describeNamespace("docs") }`,
    );

    // Assert
    expect(result.isError).toBeUndefined();
    const output = result.content[1];
    if (output?.type !== "text") {
      throw new Error("Expected discovery output");
    }
    const discovered: unknown = JSON.parse(output.text);
    expect(discovered).toMatchObject({
      matches: [{ name: toolName }],
      namespace: {
        name: "mcp__docs",
        instructions: "Read documentation before editing",
        tools: [toolName],
      },
    });
    expect(discovered).toHaveProperty("matches.0.description", expect.stringContaining("Use narrow queries"));
    expect(discovered).toHaveProperty("tool", expect.stringContaining("Use narrow queries"));
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
