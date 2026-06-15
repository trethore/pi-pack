import type { AgentToolResult, ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { PiTinyMcpConfig } from '#src/config/schema.js';
import { countFailedRefreshResults, formatRefreshResults } from '#src/core/refresh-results.js';
import { formatSchema } from '#src/core/tool-metadata.js';
import type { RefreshResult, TinyMcpRuntime } from '#src/core/runtime.js';
import type { ToolMetadata } from '#src/core/types.js';

type ProxyToolResult = AgentToolResult<Record<string, unknown>>;

type ProxyParametersSchema = ReturnType<typeof createProxyParametersSchema>;

interface ProxyParameters {
  server?: string;
  search?: string;
  describe?: string;
  connect?: string;
  refresh?: string;
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
    promptSnippet: 'Search, inspect, connect, and call configured MCP server tools through one compact gateway.',
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
  if (params.tool) return executeCall(runtime, params.tool, params.args);
  if (params.refresh) return executeRefresh(runtime, params.refresh);
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
      'Use mcp({ search: "query" }), mcp({ server: "name" }), mcp({ refresh: "name" }), or mcp({ tool: "tool_name", args: "{}" }).'
    );
  }

  return {
    content: [{ type: 'text', text: lines.join('\n').trim() }],
    details: { mode: 'status', servers: statuses },
  };
}

async function executeCall(
  runtime: TinyMcpRuntime,
  toolName: string,
  argsJson: string | undefined
): Promise<ProxyToolResult> {
  const tool = runtime.describeTool(toolName);
  if (!tool) return toolNotFoundResult(toolName, 'call');

  const parsedArgs = parseProxyArgs(argsJson);
  if (!parsedArgs.ok) return invalidArgsResult(toolName, parsedArgs.message);

  try {
    return await runtime.callToolWithArgs(toolName, parsedArgs.args);
  } catch (error) {
    return serverFailureResult('call', tool.serverName, getErrorMessage(error), toolName);
  }
}

async function executeRefresh(runtime: TinyMcpRuntime, target: string): Promise<ProxyToolResult> {
  if (isAllServersTarget(target)) return refreshAllServers(runtime);
  return refreshOneServer(runtime, target);
}

async function refreshAllServers(runtime: TinyMcpRuntime): Promise<ProxyToolResult> {
  const results = await runtime.refreshAllServers();
  return refreshResult(results);
}

async function refreshOneServer(runtime: TinyMcpRuntime, serverName: string): Promise<ProxyToolResult> {
  if (!runtime.hasServer(serverName)) return serverNotFoundResult(serverName, 'refresh');

  const result = await runtime.refreshServer(serverName);
  if (result.status === 'failed') {
    return serverFailureResult('refresh', result.serverName, result.error ?? 'unknown');
  }
  return refreshResult([result]);
}

function refreshResult(results: RefreshResult[]): ProxyToolResult {
  return {
    content: [{ type: 'text', text: formatRefreshResults(results) }],
    details: {
      mode: 'refresh',
      count: results.length,
      failedCount: countFailedRefreshResults(results),
      results,
    },
  };
}

async function executeConnect(runtime: TinyMcpRuntime, serverName: string): Promise<ProxyToolResult> {
  if (!runtime.hasServer(serverName)) return serverNotFoundResult(serverName, 'connect');

  try {
    await runtime.connectServer(serverName);
  } catch (error) {
    return serverFailureResult('connect', serverName, getErrorMessage(error));
  }

  const tools = runtime.listTools(serverName);
  return {
    content: [{ type: 'text', text: `Connected to ${serverName}. ${tools.length} tools available.` }],
    details: { mode: 'connect', server: serverName, toolCount: tools.length },
  };
}

function executeDescribe(runtime: TinyMcpRuntime, config: PiTinyMcpConfig, toolName: string): ProxyToolResult {
  const tool = runtime.describeTool(toolName);
  if (!tool) return toolNotFoundResult(toolName, 'describe');

  const lines = [tool.name, `Server: ${tool.serverName}`, '', tool.description || '(no description)'];
  if (tool.resourceUri) lines.push('', `Resource: ${tool.resourceUri}`, 'No parameters required.');
  else if (config.proxyTool.includeSchemasInSearch) lines.push('', 'Parameters:', formatSchema(tool.inputSchema));

  return {
    content: [{ type: 'text', text: lines.join('\n').trim() }],
    details: { mode: 'describe', tool },
  };
}

function executeSearch(runtime: TinyMcpRuntime, config: PiTinyMcpConfig, query: string): ProxyToolResult {
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
  if (!runtime.hasServer(serverName)) return serverNotFoundResult(serverName, 'list');

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

function toolNotFoundResult(toolName: string, mode: 'call' | 'describe'): ProxyToolResult {
  return errorResult(
    mode,
    'tool_not_found',
    `MCP tool "${toolName}" was not found.\n\nNext steps:\n- Use mcp({ search: "keyword" }) to find the displayed tool name.\n- Use mcp({}) to check whether servers have cached tools.\n- Use mcp({ connect: "server" }) to refresh a server cache.`,
    { tool: toolName }
  );
}

function serverNotFoundResult(serverName: string, mode: 'connect' | 'list' | 'refresh'): ProxyToolResult {
  return errorResult(
    mode,
    'server_not_found',
    `MCP server "${serverName}" is not configured.\n\nNext steps:\n- Run mcp({}) to list configured servers.\n- Add the server to .pi/pi-tiny-mcp.jsonc or a standard .mcp.json file.`,
    { server: serverName }
  );
}

function invalidArgsResult(toolName: string, message: string): ProxyToolResult {
  return errorResult(
    'call',
    'invalid_json_args',
    `Invalid MCP args for "${toolName}": ${message}\n\nNext steps:\n- Pass args as a JSON object string, for example: mcp({ tool: "${toolName}", args: "{\\"key\\":\\"value\\"}" }).\n- Use mcp({ describe: "${toolName}" }) to inspect the expected parameters.`,
    { tool: toolName }
  );
}

function serverFailureResult(
  mode: 'connect' | 'call' | 'refresh',
  serverName: string,
  message: string,
  toolName?: string
): ProxyToolResult {
  return errorResult(
    mode,
    'server_connection_failed',
    `MCP server "${serverName}" could not be reached: ${message}\n\nNext steps:\n- Check the server command, url, credentials, and environment variables.\n- Use mcp({ connect: "${serverName}" }) to retry after fixing the configuration.`,
    { server: serverName, tool: toolName }
  );
}

function errorResult(mode: string, error: string, text: string, details: Record<string, unknown>): ProxyToolResult {
  return {
    content: [{ type: 'text', text }],
    details: { mode, error, ...details },
  };
}

function isAllServersTarget(target: string): boolean {
  return target === 'all' || target === '*';
}

function parseProxyArgs(
  argsJson: string | undefined
): { ok: true; args: Record<string, unknown> } | { ok: false; message: string } {
  if (!argsJson?.trim()) return { ok: true, args: {} };

  try {
    const parsed = JSON.parse(argsJson) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, message: 'expected a JSON object string.' };
    }
    return { ok: true, args: parsed as Record<string, unknown> };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error) };
  }
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
  if (config?.proxyTool.includeSchemasInSearch && !tool.resourceUri) lines.push(formatSchema(tool.inputSchema, '  '));
  return lines.join('\n');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildProxyDescription(config: PiTinyMcpConfig): string {
  const serverNames = Object.keys(config.servers);
  const serverSummary = serverNames.length > 0 ? `\nConfigured servers: ${serverNames.join(', ')}` : '';
  return `MCP gateway. Use one compact tool to discover and call configured MCP server tools.${serverSummary}\n\nModes: no args=status, server=list, search=find tools, describe=show schema, connect=start server, refresh=refresh metadata, tool+args=call tool. Args must be a JSON object string.`;
}

function createProxyParametersSchema() {
  return Type.Object({
    server: Type.Optional(Type.String({ description: 'List cached tools for a server.' })),
    search: Type.Optional(Type.String({ description: 'Search MCP tools by name or description.' })),
    describe: Type.Optional(Type.String({ description: 'Show details and input schema for one MCP tool.' })),
    connect: Type.Optional(Type.String({ description: 'Connect to a server and refresh its cached tool metadata.' })),
    refresh: Type.Optional(
      Type.String({ description: 'Refresh metadata for a server, or use "all" for every server.' })
    ),
    tool: Type.Optional(Type.String({ description: 'Call an MCP tool by displayed tool name.' })),
    args: Type.Optional(Type.String({ description: 'JSON object string passed as MCP tool arguments.' })),
  });
}
