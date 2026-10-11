import { describe, expect, it } from "vitest";
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolLoadout } from "@earendil-works/pi-coding-agent";
import { CODEMODE_DOCS_PATH } from "#src/constants";
import { MCP_TYPESCRIPT_PREAMBLE, renderToolSample } from "#src/declarations/render";
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
  it.each([false, true])("dedents the prompt and conditionally describes models (models=%s)", (models) => {
    // Act
    const description = createCodemodeToolDefinition({ models }).description;

    // Assert
    expect(description.startsWith("Run JavaScript")).toBe(true);
    expect(description).toContain(
      '\n- Optional first line: `// @options: {"max_output_tokens": 10000, "timeout_ms": 60000}`',
    );
    expect(description).toContain("\n\nGlobals:\n- `text(value)`");
    expect(description.split("\n").some((line) => /^\s+\S/.test(line))).toBe(false);
    expect(description.endsWith("\n")).toBe(false);
    expect(
      description.includes(`- \`models\`: classifiers and image generation. Read ${CODEMODE_DOCS_PATH} first.`),
    ).toBe(models);
  });

  it.each([0, 3000])("includes shared MCP types only for listed tools (budget=%s)", (budget) => {
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
      expect(description).toContain(`Shared MCP Types:\n\`\`\`ts\n${MCP_TYPESCRIPT_PREAMBLE}\n\`\`\``);
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
