import { argumentsArray, isRecord } from "#src/sandbox/values";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolNamespace } from "@earendil-works/pi-coding-agent";
import type { CodemodeTool } from "#src/sandbox/types";
import type { CodemodeToolOptions } from "#src/types";
import { toCodemodeIdentifier } from "#src/declarations/identifier";
import { Bm25Ranker, createToolSearchDocument } from "#src/search";

const DiscoveryGlobalName = {
  SearchTools: "searchTools",
  DescribeTool: "describeTool",
  DescribeNamespace: "describeNamespace",
} as const;

const DEFAULT_TOOL_SEARCH_LIMIT = 8;

function isNamespaceName(namespace: string, query: string): boolean {
  const id = toCodemodeIdentifier(namespace);
  const queryId = toCodemodeIdentifier(query);
  return namespace === query || id === queryId || suffix(namespace) === query || suffix(id) === queryId;
}

/**
 * `searchTools()`, `describeTool()`, and `describeNamespace()`: ranked search and lookup over the
 * script's nested tools and their namespaces.
 */
export function createDiscoveryGlobals(
  tools: readonly AgentTool[],
  samples: ReadonlyMap<string, string>,
  options: CodemodeToolOptions,
): CodemodeTool[] {
  const ranker = new Bm25Ranker();
  const entry = (name: string) => ({ name: toCodemodeIdentifier(name), description: samples.get(name) ?? "" });

  function searchTools(args: unknown) {
    const { query, limit, namespace } = searchArguments(args);
    const documents = tools.flatMap((tool) => {
      const toolNamespace = options.getToolNamespace?.(tool.name);
      if (namespace && (!toolNamespace || !isNamespaceName(toolNamespace.name, namespace))) {
        return [];
      }
      return [createToolSearchDocument(tool, toolNamespace)];
    });

    return ranker.rank(query, documents, limit).map((match) => entry(match.name));
  }

  function describeTool(args: unknown) {
    const [name] = argumentsArray(args);
    if (typeof name !== "string") {
      throw new Error(`${DiscoveryGlobalName.DescribeTool}() expects a tool name`);
    }

    const tool = tools.find((candidate) => candidate.name === name || toCodemodeIdentifier(candidate.name) === name);
    return tool ? samples.get(tool.name) : undefined;
  }

  function describeNamespace(args: unknown) {
    const [name] = argumentsArray(args);
    if (typeof name !== "string") {
      throw new Error(`${DiscoveryGlobalName.DescribeNamespace}() expects a namespace name`);
    }

    let namespace: ToolNamespace | undefined;
    const names: string[] = [];
    for (const tool of tools) {
      const toolNamespace = options.getToolNamespace?.(tool.name);
      if (!toolNamespace || !isNamespaceName(toolNamespace.name, name)) {
        continue;
      }
      namespace ??= toolNamespace;
      names.push(toCodemodeIdentifier(tool.name));
    }

    if (!namespace) {
      return undefined;
    }

    return {
      name: namespace.name,
      ...(namespace.description ? { description: namespace.description } : {}),
      ...(namespace.instructions ? { instructions: namespace.instructions } : {}),
      tools: names,
    };
  }

  return [
    { name: DiscoveryGlobalName.SearchTools, spread: true, execute: searchTools },
    { name: DiscoveryGlobalName.DescribeTool, spread: true, execute: describeTool },
    { name: DiscoveryGlobalName.DescribeNamespace, spread: true, execute: describeNamespace },
  ];
}

const suffix = (name: string) => (name.includes("__") ? name.slice(name.lastIndexOf("__") + 2) : undefined);

function searchArguments(args: unknown) {
  const [query, rawOptions] = argumentsArray(args);
  const searchOptions = rawOptions ?? {};
  if (!isRecord(searchOptions)) {
    throw new Error(`${DiscoveryGlobalName.SearchTools}() options must be an object`);
  }
  if (typeof query !== "string") {
    throw new Error(`${DiscoveryGlobalName.SearchTools}() expects a query string`);
  }
  const limit = searchOptions.limit ?? DEFAULT_TOOL_SEARCH_LIMIT;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0) {
    throw new Error(`${DiscoveryGlobalName.SearchTools}() limit must be a positive integer`);
  }
  const namespace = searchOptions.namespace;
  if (namespace != null && typeof namespace !== "string") {
    throw new Error(`${DiscoveryGlobalName.SearchTools}() namespace must be a string`);
  }
  return { query, limit, namespace };
}
