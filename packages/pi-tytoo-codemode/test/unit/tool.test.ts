import { describe, expect, it } from "vitest";
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolLoadout } from "@earendil-works/pi-coding-agent";
import { CODEMODE_DOCS_PATH } from "#src/constants";
import { renderToolSample } from "#src/declarations/render";
import { toCodemodeDeclaration } from "#src/declarations/tools";
import { createCodemodeToolDefinition } from "#src/tool";
import { sampleTool } from "#test/support/harness";

function createLoadout(tools: AgentTool[]): ToolLoadout {
  return {
    declared: [],
    callable: tools,
    registered: tools,
    getExposure: () => "codemode",
    getNamespace: () => undefined,
    getPromptGuidelines: () => [],
  };
}

describe("codemode descriptions", () => {
  it.each([
    { mode: "on", models: false, budget: 3000 },
    { mode: "only", models: true, budget: 3000 },
    { mode: "only", models: true, budget: 0 },
  ] as const)("renders model-facing text ($mode, models=$models, budget=$budget)", ({ mode, models, budget }) => {
    // Arrange
    const direct = sampleTool("read");
    const nested = { ...sampleTool("server-search"), description: "Search the server." };
    const definition = createCodemodeToolDefinition({ models, getMode: () => mode, getInlineBudget: () => budget });
    const loadout: ToolLoadout = {
      ...createLoadout([direct, nested]),
      declared: [direct],
      getExposure: (name) => (name === direct.name ? "direct" : "codemode"),
      getNamespace: (name) => (name === nested.name ? { name: "server", description: "Server tools." } : undefined),
      getPromptGuidelines: () => ["Use narrow queries"],
    };

    // Act
    const changes = definition.prepareLoadout?.(loadout);
    const text = JSON.stringify({
      description: definition.description,
      snippet: definition.promptSnippet,
      guidelines: definition.promptGuidelines,
      parameters: definition.parameters,
      executionMode: definition.executionMode,
      changes,
    }).replaceAll(CODEMODE_DOCS_PATH, "<codemode-docs>");

    // Assert
    expect(JSON.parse(text)).toMatchSnapshot();
  });

  it.each([false, true])("formats the prompt and conditionally describes models (models=%s)", (models) => {
    // Act
    const description = createCodemodeToolDefinition({ models }).description;

    // Assert
    expect(description.startsWith("Run JavaScript")).toBe(true);
    expect(description).toContain('\nOptional first line: `// @options: {"max_output_tokens": 10000}`');
    expect(description).toContain("\n\nGlobals:\n- `text(value)`");
    expect(description.split("\n").some((line) => /^\s+\S/.test(line))).toBe(false);
    expect(description.endsWith("\n")).toBe(false);
    expect(
      description.includes(
        `- \`models\`: classifiers and image generation. Before you use \`models\`, read ${CODEMODE_DOCS_PATH}.`,
      ),
    ).toBe(models);
  });

  it("explains failure handling, persistence, cancellation, and discovery", () => {
    // Act
    const tool = createCodemodeToolDefinition({});
    const guidelines = tool.promptGuidelines?.join("\n");

    // Assert
    expect(tool.executionMode).toBe("sequential");
    expect(tool.description).toContain("Calls can throw exceptions or return error results.");
    expect(tool.description).toContain("a nonzero `exit_code` or `isError: true`");
    expect(tool.description).toContain("A returned error does not automatically fail the script.");
    expect(tool.description).toContain("If the script fails, its stored-state writes are discarded.");
    expect(tool.description).toContain("Completed tool actions are not undone.");
    expect(tool.description).toContain("`load()`, `describeTool()`, and `describeNamespace()` return `undefined`");
    expect(tool.description).toContain("JSON output omits object properties with this value.");
    expect(tool.description).toContain("`value ?? null`");
    expect(tool.description).toContain("`tools` is not automatically a registered namespace.");
    expect(tool.description).toContain("By default, no deadline is set.");
    expect(tool.description).toContain('text(await searchTools("query"))');
    expect(tool.description).not.toContain("{ limit?, namespace? }");
    expect(tool.description).toContain("`await describeTool(name)`");
    expect(tool.description).toContain("`await describeNamespace(name)`");
    expect(tool.description).toContain("`return value` print output");
    expect(guidelines).toContain("pending calls receive an abort signal");
    expect(guidelines).toContain("Do not run separate codemode invocations concurrently.");
    expect(guidelines).toContain("Independent nested tool calls may run in parallel.");
    expect(guidelines).toContain("Use Promise.allSettled() to wait for every outcome.");
    expect(guidelines).toContain("Use Promise.all() when the first rejection should stop the wait.");
    expect(guidelines).toContain("Use discovery only for unlisted tools or missing details.");
  });

  it.each([0, 3000])("renders self-contained MCP types only for listed tools (budget=%s)", (budget) => {
    // Arrange
    const tool = {
      ...sampleTool("mcp_search"),
      description: "First line\n  Preserve this indentation.",
      outputSchema: Type.Object({
        content: Type.Array(Type.Object({})),
        isError: Type.Boolean(),
        _meta: Type.Object({}),
      }),
    };
    const definition = createCodemodeToolDefinition({ getInlineBudget: () => budget });
    const loadout = createLoadout([tool]);

    // Act
    const changes = definition.prepareLoadout?.(loadout);
    const description = changes?.descriptions?.codemode;

    // Assert
    expect(description).toContain("Nested tools:");
    if (budget === 0) {
      expect(description).not.toContain("Shared MCP Types:");
      expect(description).not.toContain(tool.description);
    } else {
      expect(description).not.toContain("Shared MCP Types:");
      expect(description).not.toContain("CallToolResult");
      expect(description).toContain("content: Array<");
      expect(description).toContain(tool.description);
    }
  });

  it("selects tools across namespace groups before filling one group", () => {
    // Arrange
    const local = sampleTool("local");
    const alphaFirst = sampleTool("a_one");
    const alphaSecond = sampleTool("a_two");
    const betaFirst = sampleTool("b_one");
    const section = `### \`${local.name}\`\n${renderToolSample(toCodemodeDeclaration(local)).trim()}`;
    const sectionCost = Math.ceil(section.length / 4);
    const definition = createCodemodeToolDefinition({ getInlineBudget: () => sectionCost * 3 });
    const loadout = createLoadout([betaFirst, alphaFirst, local, alphaSecond]);
    loadout.getNamespace = (name) => {
      if (name.startsWith("a_")) {
        return { name: "alpha" };
      }
      return name.startsWith("b_") ? { name: "beta" } : undefined;
    };

    // Act
    const changes = definition.prepareLoadout?.(loadout);
    const description = changes?.descriptions?.codemode;

    // Assert
    if (typeof description !== "string") {
      throw new Error("Expected catalog description");
    }
    expect(description).toContain(`${local.name}(args:`);
    expect(description).toContain(`${alphaFirst.name}(args:`);
    expect(description).toContain(`${betaFirst.name}(args:`);
    expect(description).not.toContain(`${alphaSecond.name}(args:`);
    expect(description).toContain("## alpha (some tools not listed)");
    expect(description).toContain("## beta\n");
    expect(description.indexOf(`### \`${local.name}\``)).toBeLessThan(description.indexOf("## alpha"));
    expect(description.indexOf("## alpha")).toBeLessThan(description.indexOf("## beta"));
  });

  it("keeps the catalog unchanged when deferred tools are loaded", () => {
    // Arrange
    const visible = sampleTool("visible");
    const deferred = sampleTool("deferred");
    const definition = createCodemodeToolDefinition({});
    const baseline = createLoadout([visible]);
    const loaded: ToolLoadout = {
      ...createLoadout([visible, deferred]),
      declared: [deferred],
      getExposure: (name) => (name === deferred.name ? "deferred" : "codemode"),
      getNamespace: (name) => (name === deferred.name ? { name: "hidden_namespace" } : undefined),
    };

    // Act
    const before = definition.prepareLoadout?.(baseline);
    const after = definition.prepareLoadout?.(loaded);

    // Assert
    expect(before?.descriptions?.codemode).toContain(`${visible.name}(args:`);
    expect(after?.descriptions?.codemode).toBe(before?.descriptions?.codemode);
  });

  it.each(["on", "only"] as const)("preserves direct tool exposure in %s mode", (mode) => {
    // Arrange
    const direct = sampleTool("direct");
    const nested = sampleTool("nested");
    const definition = createCodemodeToolDefinition({ getMode: () => mode });
    const loadout: ToolLoadout = {
      ...createLoadout([direct, nested]),
      declared: [direct],
      getExposure: (name) => (name === direct.name ? "direct" : "codemode"),
      getPromptGuidelines: () => ["Use narrow queries"],
    };

    // Act
    const changes = definition.prepareLoadout?.(loadout);

    // Assert
    if (!changes) {
      throw new Error("Expected loadout changes");
    }
    const descriptions = changes.descriptions ?? {};
    expect(descriptions.codemode).toContain(`${nested.name}(args:`);
    expect(descriptions.codemode).toContain("Use narrow queries");
    if (mode === "only") {
      expect(changes.hiddenDeclarations).toEqual([direct.name]);
      expect(descriptions.codemode).toContain(`${direct.name}(args:`);
    } else {
      expect(changes.hiddenDeclarations).toEqual([]);
      expect(descriptions.codemode).not.toContain(`${direct.name}(args:`);
      expect(descriptions[direct.name]).toBe(
        `${direct.description}\n\nCodemode: \`tools.${direct.name}(args)\` resolves to a string.`,
      );
    }
  });
});

it.each([
  { guidelines: [], expected: "  Read a file.  " },
  { guidelines: [" ", "\n"], expected: "  Read a file.  " },
  { guidelines: [" First. ", " ", "\nSecond.\n"], expected: "Read a file.\n\n- First.\n- Second." },
])("formats declaration guidelines $guidelines", ({ guidelines, expected }) => {
  // Arrange
  const tool = { ...sampleTool("read"), description: "  Read a file.  " };

  // Act
  const declaration = toCodemodeDeclaration(tool, guidelines);

  // Assert
  expect(declaration.description).toBe(expected);
});

it("uses canonical call syntax in direct tool descriptions and catalog declarations", () => {
  // Arrange
  const tools = [sampleTool("foo-bar"), sampleTool("foo_bar")];
  const loadout = { ...createLoadout(tools), declared: tools, getExposure: () => "direct" as const };
  const direct = createCodemodeToolDefinition({ getMode: () => "on" });
  const nested = createCodemodeToolDefinition({ getMode: () => "only" });

  // Act
  const directDescriptions = direct.prepareLoadout?.(loadout)?.descriptions;
  const catalog = nested.prepareLoadout?.(loadout)?.descriptions?.codemode;

  // Assert
  expect(directDescriptions?.["foo-bar"]).toContain('`tools["foo-bar"](args)`');
  expect(directDescriptions?.foo_bar).toContain("`tools.foo_bar(args)`");
  expect(catalog).toContain('"foo-bar"(args:');
  expect(catalog).toContain("foo_bar(args:");
});

describe("MCP readiness", () => {
  it.each(["searchTools", "describeTool", "describeNamespace", "ALL_TOOLS"])(
    "waits for all tools when a script uses %s",
    (name) => {
      // Arrange
      const tool = createCodemodeToolDefinition({});

      // Act
      const reach = tool.reachesTools?.({ code: `text(${name});` });

      // Assert
      expect(reach).toBe("all");
    },
  );

  it.each([
    ["await tools.mcp__docs__search({})", "mcp__docs__search"],
    ['await tools["mcp__docs__" + name]({})', "mcp__docs__"],
    ['await tools["mcp__dev-radius__search"]({})', "mcp__dev"],
  ])("reports source words for %s", (code, expected) => {
    // Arrange
    const tool = createCodemodeToolDefinition({});

    // Act
    const reach = tool.reachesTools?.({ code });

    // Assert
    expect(reach).not.toBe("all");
    expect(reach).toContain(expected);
  });

  it.each([undefined, null, 42, "", "()", "const myALL_TOOLS = 1"])("does not claim all tools for %j", (code) => {
    // Arrange
    const tool = createCodemodeToolDefinition({});

    // Act
    const reach = tool.reachesTools?.({ code });

    // Assert
    expect(Array.isArray(reach)).toBe(true);
  });
});
