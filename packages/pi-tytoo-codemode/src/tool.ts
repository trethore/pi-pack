import { isArray, isRecord } from "#src/sandbox/values";
import { prompts } from "#src/prompts/generated";
import { CODEMODE_TOOL_NAME, CODEMODE_DOCS_PATH } from "#src/constants";
import { getCodemodeCallableTools, toCodemodeDeclaration } from "#src/declarations/tools";
import type { CodemodeToolOptions, CodemodeToolDetails } from "#src/types";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { CodemodeJsonSchema, CodemodeTool } from "#src/sandbox/types";
import { renderToolOutputType, renderToolSample } from "#src/declarations/render";
import { CODEMODE_SOURCE_GRAMMAR } from "#src/source/grammar";
import { Type } from "typebox";
import type { ToolDefinition, ToolLoadout, ToolLoadoutChanges, ToolNamespace } from "@earendil-works/pi-coding-agent";
import { executeCodemode } from "#src/execute";
import { renderMemberAccess } from "#src/declarations/identifier";
import { createRenderers } from "#src/render";

/** Default for {@link CodemodeDescriptionOptions.inlineBudget}, in estimated tokens. */
const DEFAULT_CODEMODE_INLINE_BUDGET = 3000;
/** Characters per token when estimating the cost of a tool section. */
const CHARS_PER_TOKEN = 4;

export const codemodeSchema = Type.Object({
  code: Type.String({
    description: prompts.tool.code,
  }),
});

/** One line per global. The details live in {@link CODEMODE_DOCS_PATH}. */
function describeGlobals(models: boolean): string {
  const description = prompts.tool.globals;

  if (models) {
    return `${description}\n${prompts.tool.models({ docsPath: CODEMODE_DOCS_PATH })}`;
  }

  return description;
}

interface CodemodeDescriptionOptions {
  /** Declare the `models` namespace; only for tools created with model access. */
  models?: boolean;
  /** Namespace of each tool, by tool name. Tools of one namespace are listed under one heading. */
  namespaces?: ReadonlyMap<string, ToolNamespace>;
  /** Tools that are callable but never listed with their declaration (`deferred` exposure). */
  deferred?: ReadonlySet<string>;
  /** Prompt guidelines of each tool, by tool name, listed after its description. */
  guidelines?: ReadonlyMap<string, readonly string[]>;
  /**
   * Estimated tokens (characters / 4) the tool sections may use. Tools that do not fit are left
   * out, like deferred tools. Unset lists every tool that is not deferred.
   */
  inlineBudget?: number;
}

/** `### \`id\` (\`raw name\`)` followed by the tool's description and declaration. */
function renderToolSection(declaration: Omit<CodemodeTool, "execute">): string {
  const heading = `### \`${declaration.name}\``;

  return `${heading}\n${renderToolSample(declaration).trim()}`;
}

interface CatalogEntry {
  name: string;
  section: string;
  cost: number;
}

interface CatalogGroup {
  namespace: ToolNamespace | undefined;
  entries: CatalogEntry[];
}

function createCatalogGroups(
  declarations: readonly Omit<CodemodeTool, "execute">[],
  namespaces: ReadonlyMap<string, ToolNamespace> | undefined,
): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>([["", { namespace: undefined, entries: [] }]]);

  for (const declaration of declarations) {
    const namespace = namespaces?.get(declaration.name);
    const key = namespace ? `ns:${namespace.name}` : "";
    const group = groups.get(key) ?? { namespace, entries: [] };
    groups.set(key, group);

    const section = renderToolSection(declaration);
    group.entries.push({ name: declaration.name, section, cost: Math.ceil(section.length / CHARS_PER_TOKEN) });
  }

  return [...groups.values()].sort(compareCatalogGroups);
}

function compareCatalogGroups(first: CatalogGroup, second: CatalogGroup): number {
  if (first.namespace === undefined) {
    return second.namespace === undefined ? 0 : -1;
  }
  if (second.namespace === undefined) {
    return 1;
  }

  return first.namespace.name.localeCompare(second.namespace.name);
}

/**
 * Pick the tool sections that fit the budget, like OpenCode's catalog: in each round every group
 * (tools without a namespace first, then namespaces by name) places its cheapest remaining tool; a
 * group whose next tool does not fit drops out while the others continue. Every namespace is
 * represented before any namespace is complete.
 */
function selectCatalog(groups: readonly CatalogGroup[], budget: number | undefined): Set<string> {
  if (budget === undefined) {
    return new Set(groups.flatMap((group) => group.entries.map((entry) => entry.name)));
  }

  const queues = groups.map((group) => [...group.entries].sort((a, b) => a.cost - b.cost));
  const shown = new Set<string>();
  let remaining = budget;

  function selectNextEntry(queue: CatalogEntry[]): boolean {
    const next = queue[0];
    if (!next || next.cost > remaining) {
      return false;
    }

    remaining -= next.cost;
    shown.add(next.name);
    queue.shift();

    return queue.length > 0;
  }

  let active = queues.filter((queue) => queue.length > 0);
  while (active.length > 0) {
    active = active.filter(selectNextEntry);
  }

  return shown;
}

/**
 * Model-facing description: the helper list, guidance for finding tools that are not listed, the
 * `models` API, and one section per listed tool,
 * grouped by namespace. Deferred tools are never listed and do not affect the description at all, so
 * it stays the same while MCP servers connect or change their tools. Tool sections are limited to
 * `inlineBudget`.
 */
function createCodemodeDescription(tools: readonly AgentTool[], options: CodemodeDescriptionOptions = {}): string {
  const declarations = getCodemodeCallableTools(tools)
    .filter((tool) => !options.deferred?.has(tool.name))
    .map((tool) => toCodemodeDeclaration(tool, options.guidelines?.get(tool.name)));

  const ordered = createCatalogGroups(declarations, options.namespaces);
  const shown = selectCatalog(ordered, options.inlineBudget);

  const sections = [prompts.tool.description, describeGlobals(options.models === true)];
  if (declarations.length === 0) {
    return sections.join("\n\n");
  }

  const toolSections = catalogSections(ordered, shown);
  sections.push(toolSections.join("\n\n"));

  return sections.join("\n\n");
}

function describeFields(schema: unknown, depth: number): string | undefined {
  if (!isRecord(schema)) {
    return undefined;
  }
  const { type, properties, required } = schema;
  if (type !== "object" || !isRecord(properties)) {
    return undefined;
  }
  const requiredNames = new Set(isArray(required) ? required : []);
  const fields = Object.entries(properties).map(([name, field]) => {
    const nested = depth > 0 ? describeFields(field, depth - 1) : undefined;
    return `${name}${requiredNames.has(name) ? "" : "?"}${nested ? `: ${nested}` : ""}`;
  });
  return `{ ${fields.join(", ")} }`;
}

/**
 * What a script call resolves to, in one line: `a string`, the field names of an object
 * (`{ output, exit_code, full_output_path? }`), or the rendered type for anything else.
 */
function describeOutput(schema: CodemodeJsonSchema | undefined): string {
  const type = renderToolOutputType(schema);
  if (type === "string") {
    return prompts.tool.stringOutput;
  }

  const fields = describeFields(schema, 1);
  return `\`${fields ?? type.replace(/\s+/g, " ")}\``;
}

/**
 * A declared tool's description followed by how scripts call it and what the call resolves to. The
 * arguments are the tool's declared parameters, so they are not repeated.
 */
function describeScriptCall(tool: AgentTool): string {
  const output = describeOutput(toCodemodeDeclaration(tool).outputSchema);
  const call = prompts.tool.scriptCall({ call: renderMemberAccess("tools", tool.name), output });

  return [tool.description.trim(), call].join("\n\n");
}

/**
 * How the codemode tool presents tools that are both declared and callable from scripts:
 * - `on`: their descriptions say how scripts call them, and the codemode description
 *   lists only the callable tools without `direct` exposure.
 * - `only`: the codemode description lists every callable tool, and requests leave out the
 *   declarations of active `direct` tools.
 *
 * Listed tools carry their prompt guidelines, which the system prompt only has for declared tools.
 *
 * Listing by exposure, not by the active set, keeps the codemode description unchanged when
 * `tool_search` loads a tool, so loads do not redeclare codemode.
 */
function prepareCodemodeLoadout(loadout: ToolLoadout, options: CodemodeToolOptions): ToolLoadoutChanges {
  const mode = options.getMode?.() ?? "on";
  const isDirect = (tool: AgentTool) => loadout.getExposure(tool.name) === "direct";
  const callable = getCodemodeCallableTools(loadout.callable);
  const callableNames = new Set(callable.map((tool) => tool.name));

  const descriptions: Record<string, string> = {};
  if (mode === "on") {
    for (const tool of loadout.declared) {
      if (callableNames.has(tool.name)) {
        descriptions[tool.name] = describeScriptCall(tool);
      }
    }
  }

  const listed = mode === "only" ? callable : callable.filter((tool) => !isDirect(tool));
  const descriptionOptions = createLoadoutDescriptionOptions(listed, loadout, options);
  descriptions[CODEMODE_TOOL_NAME] = createCodemodeDescription(listed, descriptionOptions);

  const declaredNames = new Set(loadout.declared.map((tool) => tool.name));
  return {
    descriptions,
    hiddenDeclarations:
      mode === "only"
        ? callable.filter((tool) => isDirect(tool) && declaredNames.has(tool.name)).map((tool) => tool.name)
        : [],
  };
}

function createLoadoutDescriptionOptions(
  tools: readonly AgentTool[],
  loadout: ToolLoadout,
  options: CodemodeToolOptions,
): CodemodeDescriptionOptions {
  const namespaces = new Map<string, ToolNamespace>();
  const guidelines = new Map<string, readonly string[]>();
  const deferred = new Set<string>();

  for (const tool of tools) {
    const namespace = loadout.getNamespace(tool.name);
    if (namespace) {
      namespaces.set(tool.name, namespace);
    }

    guidelines.set(tool.name, loadout.getPromptGuidelines(tool.name));
    if (loadout.getExposure(tool.name) === "deferred") {
      deferred.add(tool.name);
    }
  }

  return {
    models: options.models === true,
    namespaces,
    guidelines,
    deferred,
    inlineBudget: options.getInlineBudget?.() ?? DEFAULT_CODEMODE_INLINE_BUDGET,
  };
}

const DISCOVERY_GLOBALS = /\b(searchTools|describeNamespace|describeTool|ALL_TOOLS)\b/;

/**
 * The tools a script may call (`ToolDefinition.reachesTools`): every tool when it uses a discovery
 * global, else the words of its source, so `tools.mcp__docs__search` and
 * `tools["mcp__docs__" + name]` both name the `mcp__docs` namespace.
 */
function getScriptReach(code: unknown): "all" | readonly string[] {
  if (typeof code !== "string") {
    return [];
  }
  return DISCOVERY_GLOBALS.test(code) ? "all" : (code.match(/\w+/g) ?? []);
}

export function createCodemodeToolDefinition(
  options: CodemodeToolOptions,
): ToolDefinition<typeof codemodeSchema, CodemodeToolDetails | undefined> {
  return {
    name: CODEMODE_TOOL_NAME,
    label: CODEMODE_TOOL_NAME,
    // Replaced with the declarations of the callable tools when the tool is activated.
    description: createCodemodeDescription([], { models: options.models === true }),
    promptSnippet: prompts.tool.snippet,
    promptGuidelines: [...prompts.tool.guidelines],
    parameters: codemodeSchema,
    // Scripts must not start other scripts.
    exposure: "model-only",
    executionMode: "sequential",
    reachesTools: (input) => getScriptReach(input.code),
    prepareLoadout: (loadout) => prepareCodemodeLoadout(loadout, options),
    // Capable models write the script as raw text instead of a JSON-escaped string.
    constrainedSampling: { type: "grammar", variants: { openai_lark: CODEMODE_SOURCE_GRAMMAR } },
    // The sandbox (worker, QuickJS wasm) loads on the first call, not at startup.
    execute: async (toolCallId, params, signal, onUpdate, ctx) =>
      executeCodemode(toolCallId, params, signal, onUpdate, ctx, options),
    ...createRenderers(options.getPrettyResults),
  };
}

function catalogSections(ordered: CatalogGroup[], shown: Set<string>): string[] {
  const toolSections: string[] = [prompts.tool.nestedTools];

  for (const { namespace, entries } of ordered) {
    const visible = entries.filter((entry) => shown.has(entry.name));
    if (namespace) {
      // Only tools that did not fit the budget are counted as not listed here.
      let listing = "";
      if (visible.length < entries.length) {
        listing = visible.length === 0 ? prompts.tool.toolsNotListed : prompts.tool.someToolsNotListed;
      }

      const description = namespace.description?.trim();
      toolSections.push(`## ${namespace.name}${listing}${description ? `\n${description}` : ""}`);
    }

    for (const entry of visible) {
      toolSections.push(entry.section);
    }
  }

  return toolSections;
}
