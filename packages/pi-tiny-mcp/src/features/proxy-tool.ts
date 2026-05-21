import type {
  AgentToolResult,
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { PiTinyMcpConfig } from '#src/config/schema.js';
import { formatSchema } from '#src/core/tool-metadata.js';
import type { TinyMcpRuntime } from '#src/core/runtime.js';
import type { ToolMetadata } from '#src/core/types.js';

type ProxyToolResult = AgentToolResult<Record<string, unknown>>;

type ProxyParametersSchema = ReturnType<typeof createProxyParametersSchema>;

export interface ProxyParameters {
  server?: string;
  search?: string;
  describe?: string;
  connect?: string;
  tool?: string;
  args?: string;
}

export function registerProxyTool(
  pi: ExtensionAPI,
  config: PiTinyMcpConfig,
  getRuntime: () => Promise<TinyMcpRuntime>
): void {
  if (!config.proxyTool.enabled) return;
  pi.registerTool(createProxyToolDefinition(config, getRuntime));
}

function createProxyToolDefinition(
  config: PiTinyMcpConfig,
  getRuntime: () => Promise<TinyMcpRuntime>
): ToolDefinition<ProxyParametersSchema, Record<string, unknown>> {
  return {
    name: config.proxyTool.name,
    label: 'MCP',
    description: buildProxyDescription(config),
    promptSnippet:
      'Search, inspect, connect, and call configured MCP server tools through one compact gateway.',
    parameters: createProxyParametersSchema(),
    async execute(_toolCallId, params) {
      const runtime = await getRuntime();
      return executeProxyMode(runtime, config, params);
    },
  };
}

async function executeProxyMode(
  runtime: TinyMcpRuntime,
  config: PiTinyMcpConfig,
  params: ProxyParameters
): Promise<ProxyToolResult> {
  if (params.tool) return runtime.callTool(params.tool, params.args);
  if (params.connect) return executeConnect(runtime, params.connect);
  if (params.describe) return executeDescribe(runtime, config, params.describe);
  if (params.search) return executeSearch(runtime, config, params.search);
  if (params.server) return executeList(runtime, params.server);
  return executeStatus(runtime);
}

function executeStatus(runtime: TinyMcpRuntime): ProxyToolResult {
  const statuses = runtime.getStatus();
  const connectedCount = statuses.filter((server) => server.status === 'connected').length;
  const totalTools = statuses.reduce((sum, server) => sum + server.toolCount, 0);
  const lines = [`MCP: ${connectedCount}/${statuses.length} servers, ${totalTools} tools`, ''];

  for (const server of statuses) {
    lines.push(formatServerStatus(server));
  }

  if (statuses.length > 0) {
    lines.push(
      '',
      'Use mcp({ search: "query" }), mcp({ server: "name" }), or mcp({ tool: "tool_name", args: "{}" }).'
    );
  }

  return {
    content: [{ type: 'text', text: lines.join('\n').trim() }],
    details: { mode: 'status', servers: statuses },
  };
}

async function executeConnect(
  runtime: TinyMcpRuntime,
  serverName: string
): Promise<ProxyToolResult> {
  await runtime.connectServer(serverName);
  const tools = runtime.listTools(serverName);
  return {
    content: [
      { type: 'text', text: `Connected to ${serverName}. ${tools.length} tools available.` },
    ],
    details: { mode: 'connect', server: serverName, toolCount: tools.length },
  };
}

function executeDescribe(
  runtime: TinyMcpRuntime,
  config: PiTinyMcpConfig,
  toolName: string
): ProxyToolResult {
  const tool = runtime.describeTool(toolName);
  if (!tool) return notFoundResult(toolName);

  const lines = [
    tool.name,
    `Server: ${tool.serverName}`,
    '',
    tool.description || '(no description)',
  ];
  if (tool.resourceUri) lines.push('', `Resource: ${tool.resourceUri}`, 'No parameters required.');
  else if (config.proxyTool.includeSchemasInSearch)
    lines.push('', 'Parameters:', formatSchema(tool.inputSchema));

  return {
    content: [{ type: 'text', text: lines.join('\n').trim() }],
    details: { mode: 'describe', tool },
  };
}

function executeSearch(
  runtime: TinyMcpRuntime,
  config: PiTinyMcpConfig,
  query: string
): ProxyToolResult {
  const matches = runtime.searchTools(query);
  const text =
    matches.length === 0
      ? `No MCP tools matched "${query}".`
      : matches.map((tool) => formatToolSummary(tool, config)).join('\n\n');
  return {
    content: [{ type: 'text', text }],
    details: { mode: 'search', query, count: matches.length, tools: matches },
  };
}

function executeList(runtime: TinyMcpRuntime, serverName: string): ProxyToolResult {
  const tools = runtime.listTools(serverName);
  const text =
    tools.length === 0
      ? `No cached tools for ${serverName}. Try mcp({ connect: "${serverName}" }).`
      : tools.map((tool) => formatToolSummary(tool)).join('\n\n');
  return {
    content: [{ type: 'text', text }],
    details: { mode: 'list', server: serverName, count: tools.length, tools },
  };
}

function notFoundResult(toolName: string): ProxyToolResult {
  return {
    content: [
      { type: 'text', text: `Tool "${toolName}" not found. Use mcp({ search: "..." }) to search.` },
    ],
    details: { mode: 'describe', error: 'tool_not_found', tool: toolName },
  };
}

function formatServerStatus(server: ReturnType<TinyMcpRuntime['getStatus']>[number]): string {
  const marker = getStatusMarker(server.status);
  const suffix = server.error ? `: ${server.error}` : '';
  return `${marker} ${server.name} (${server.status}, ${server.toolCount} tools)${suffix}`;
}

function getStatusMarker(status: string): string {
  if (status === 'connected') return '+';
  if (status === 'failed') return 'x';
  return '-';
}

function formatToolSummary(tool: ToolMetadata, config?: PiTinyMcpConfig): string {
  const lines = [tool.name, `  Server: ${tool.serverName}`];
  if (tool.description) lines.push(`  ${tool.description}`);
  if (config?.proxyTool.includeSchemasInSearch && !tool.resourceUri)
    lines.push(formatSchema(tool.inputSchema, '  '));
  return lines.join('\n');
}

function buildProxyDescription(config: PiTinyMcpConfig): string {
  const serverNames = Object.keys(config.servers);
  const serverSummary =
    serverNames.length > 0 ? `\nConfigured servers: ${serverNames.join(', ')}` : '';
  return `MCP gateway. Use one compact tool to discover and call configured MCP server tools.${serverSummary}\n\nModes: no args=status, server=list, search=find tools, describe=show schema, connect=start server, tool+args=call tool. Args must be a JSON object string.`;
}

function createProxyParametersSchema() {
  return Type.Object({
    server: Type.Optional(Type.String({ description: 'List cached tools for a server.' })),
    search: Type.Optional(Type.String({ description: 'Search MCP tools by name or description.' })),
    describe: Type.Optional(
      Type.String({ description: 'Show details and input schema for one MCP tool.' })
    ),
    connect: Type.Optional(
      Type.String({ description: 'Connect to a server and refresh its cached tool metadata.' })
    ),
    tool: Type.Optional(Type.String({ description: 'Call an MCP tool by displayed tool name.' })),
    args: Type.Optional(
      Type.String({ description: 'JSON object string passed as MCP tool arguments.' })
    ),
  });
}
