import { describe, expect, it } from "vitest";
import { harness, outcome, resultText, sampleTool } from "#test/support/harness";
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

  it.each(['load("missing")', 'await describeTool("missing")', 'await describeNamespace("tools")'])(
    "preserves missing lookup semantics for %s",
    async (lookup) => {
      // Arrange
      const test = harness();

      // Act
      const result = await test.run(`
        const value = ${lookup};
        text(value);
        return { omitted: { value }, explicit: { value: value ?? null, missing: value === undefined } };
      `);

      // Assert
      expect(result.isError).toBeUndefined();
      expect(resultText(result)).toContain("==> text 1/2 <==\nundefined");
      expect(resultText(result)).toContain('{"omitted":{},"explicit":{"value":null,"missing":true}}');
      expect(test.executeTool).not.toHaveBeenCalled();
    },
  );

  it("resolves tools as a namespace only when that name is registered", async () => {
    // Arrange
    const test = harness([sampleTool("echo")], { getToolNamespace: () => ({ name: "tools" }) });

    // Act
    const result = await test.run('return await describeNamespace("tools")');

    // Assert
    expect(result.isError).toBeUndefined();
    expect(result.content.slice(1)).toEqual([{ type: "text", text: '{"name":"tools","tools":["echo"]}' }]);
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

describe("canonical discovery", () => {
  it.each([false, true])("discovers and calls colliding tools (reverse=%s)", async (reverse) => {
    // Arrange
    const names = ["foo-bar", "foo.bar", "foo_bar", "solo-tool"];
    if (reverse) {
      names.reverse();
    }
    const test = harness(
      names.map((name) => sampleTool(name)),
      {
        getToolNamespace: () => ({ name: "example" }),
      },
    );
    test.executeTool.mockImplementation(async (name) =>
      outcome(name, {
        content: [{ type: "text", text: name }],
        details: undefined,
      }),
    );

    // Act
    const result = await test.run(`
      const matches = await searchTools("foo");
      return {
        all: ALL_TOOLS.map(tool => tool.name),
        matches: matches.map(tool => tool.name).sort(),
        calls: await Promise.all(matches.map(tool => tools[tool.name]({}))),
        namespace: await describeNamespace("example"),
        described: await describeTool("foo_bar"),
        uniqueAlias: await describeTool("solo_tool"),
      };
    `);

    // Assert
    expect(result.isError).toBeUndefined();
    const content = result.content[1];
    if (content?.type !== "text") {
      throw new Error("Expected discovery output");
    }
    const discovered: unknown = JSON.parse(content.text);
    expect(discovered).toMatchObject({
      all: names,
      matches: ["foo-bar", "foo.bar", "foo_bar"],
      namespace: { tools: names },
    });
    expect(discovered).toHaveProperty("calls", expect.arrayContaining(["foo-bar", "foo.bar", "foo_bar"]));
    expect(discovered).toHaveProperty("described", expect.stringContaining("Run foo_bar"));
    expect(discovered).toHaveProperty("uniqueAlias", expect.stringContaining('"solo-tool"(args:'));
    expect(test.executeTool.mock.calls.map((call) => call[0]).sort()).toEqual(["foo-bar", "foo.bar", "foo_bar"]);
  });

  it("rejects ambiguous alias lookups instead of describing the first tool", async () => {
    // Arrange
    const test = harness([sampleTool("foo-bar"), sampleTool("foo.bar")]);

    // Act
    const result = await test.run('return await describeTool("foo_bar");');

    // Assert
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('Ambiguous tool alias "foo_bar". Use tools["foo-bar"], tools["foo.bar"].');
    expect(test.executeTool).not.toHaveBeenCalled();
  });
});
