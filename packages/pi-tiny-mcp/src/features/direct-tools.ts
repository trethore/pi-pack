import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type, type TSchema } from 'typebox';
import { isRecord } from '@trethore/pi-shared/object.js';

import type { PiTinyMcpConfig, ServerConfig } from '#src/config/schema.js';
import { isServerCacheValid, loadMetadataCache, type MetadataCache } from '#src/core/metadata-cache.js';
import type { TinyMcpRuntime } from '#src/core/runtime.js';
import type { ToolMetadata } from '#src/core/types.js';

export function registerDirectTools(
  pi: ExtensionAPI,
  config: PiTinyMcpConfig,
  runtime: TinyMcpRuntime,
  getRuntime: () => Promise<TinyMcpRuntime>
): void {
  for (const tool of runtime.listTools()) {
    if (!isDirectToolsEnabled(config, tool.serverName)) continue;
    if (tool.name === config.proxyTool.name) continue;
    pi.registerTool(createDirectToolDefinition(tool, getRuntime));
  }
}

export function shouldRegisterProxyTool(config: PiTinyMcpConfig): boolean {
  if (!config.proxyTool.enabled) return false;
  if (!config.directTools.disableProxyTool) return true;
  return !hasCompleteDirectToolCache(config);
}

function isDirectToolsEnabled(config: PiTinyMcpConfig, serverName: string): boolean {
  const definition = config.servers[serverName];
  return definition?.directTools ?? config.directTools.enabled;
}

function createDirectToolDefinition(
  tool: ToolMetadata,
  getRuntime: () => Promise<TinyMcpRuntime>
): ToolDefinition<TSchema, Record<string, unknown>> {
  return {
    name: tool.name,
    label: `MCP: ${tool.originalName}`,
    description: buildDirectToolDescription(tool),
    promptSnippet: `Call MCP tool ${tool.name} from server ${tool.serverName}.`,
    parameters: createDirectToolParameters(tool),
    async execute(_toolCallId, params) {
      const runtime = await getRuntime();
      return runtime.callToolWithArgs(tool.name, normalizeParams(params));
    },
  };
}

function buildDirectToolDescription(tool: ToolMetadata): string {
  const kind = tool.resourceUri ? 'MCP resource' : 'MCP tool';
  const description = tool.description ? `\n\n${tool.description}` : '';
  const resource = tool.resourceUri ? `\nResource URI: ${tool.resourceUri}` : '';
  return `${kind} from server "${tool.serverName}" as "${tool.originalName}".${resource}${description}`;
}

function createDirectToolParameters(tool: ToolMetadata): TSchema {
  if (tool.resourceUri) return Type.Object({});
  if (isRecord(tool.inputSchema)) return tool.inputSchema as TSchema;
  return Type.Object({});
}

function normalizeParams(params: unknown): Record<string, unknown> {
  if (isRecord(params)) return params;
  return {};
}

function hasCompleteDirectToolCache(config: PiTinyMcpConfig): boolean {
  if (!config.metadataCache.enabled) return false;

  const directServers = Object.entries(config.servers).filter(([serverName]) =>
    isDirectToolsEnabled(config, serverName)
  );
  if (directServers.length === 0) return false;

  const cache = loadMetadataCache();
  if (!cache) return false;

  return directServers.every(([serverName, definition]) =>
    hasValidCachedMetadata(config, cache, serverName, definition)
  );
}

function hasValidCachedMetadata(
  config: PiTinyMcpConfig,
  cache: MetadataCache,
  serverName: string,
  definition: ServerConfig
): boolean {
  const entry = cache.servers[serverName];
  return isServerCacheValid(entry, definition, config.metadataCache.maxAgeHours);
}
