import type { AgentToolResult } from '@earendil-works/pi-coding-agent';

import type { PiTinyMcpConfig, ServerConfig } from '#src/config/schema.js';
import { transformMcpContent } from '#src/core/content.js';
import { McpLifecycleManager } from '#src/core/lifecycle.js';
import {
  createServerCacheEntry,
  isServerCacheValid,
  loadMetadataCache,
  reconstructToolMetadata,
  saveServerMetadataCache,
} from '#src/core/metadata-cache.js';
import { authorizeOAuthServer, type OAuthAuthorizationResult } from '#src/core/oauth.js';
import { McpServerManager } from '#src/core/server-manager.js';
import { buildToolMetadata, findToolByName } from '#src/core/tool-metadata.js';
import type {
  McpContent,
  McpResource,
  McpResourceContent,
  McpTool,
  ToolMetadata,
} from '#src/core/types.js';
import { parallelLimit } from '#src/utils/concurrency.js';

export interface ServerStatus {
  name: string;
  status: 'connected' | 'cached' | 'not connected' | 'failed';
  toolCount: number;
  error?: string;
}

export interface RefreshResult {
  serverName: string;
  status: 'refreshed' | 'failed';
  toolCount: number;
  error?: string;
}

export class TinyMcpRuntime {
  readonly manager = new McpServerManager();
  readonly metadataByServer = new Map<string, ToolMetadata[]>();
  readonly failures = new Map<string, string>();
  readonly lifecycle: McpLifecycleManager;

  constructor(readonly config: PiTinyMcpConfig) {
    this.lifecycle = new McpLifecycleManager(this.manager, config.lifecycle, (serverName) => {
      this.refreshConnectedServerMetadata(serverName);
    });
    this.initializeFromCache();
  }

  async start(): Promise<void> {
    for (const [name, definition] of Object.entries(this.config.servers)) {
      this.lifecycle.registerServer(
        name,
        withDefaultLifecycle(definition, this.config.lifecycle.defaultMode)
      );
    }

    await this.connectStartupServers();
    this.lifecycle.start();
  }

  async shutdown(): Promise<void> {
    await this.lifecycle.shutdown();
  }

  getStatus(): ServerStatus[] {
    return Object.keys(this.config.servers).map((name) => this.getServerStatus(name));
  }

  hasServer(serverName: string): boolean {
    return this.config.servers[serverName] !== undefined;
  }

  listTools(serverName?: string): ToolMetadata[] {
    if (serverName) return this.metadataByServer.get(serverName) ?? [];
    return [...this.metadataByServer.values()].flat();
  }

  searchTools(query: string): ToolMetadata[] {
    const lowerQuery = query.toLowerCase();
    return this.listTools().filter((tool) => isSearchMatch(tool, lowerQuery));
  }

  describeTool(toolName: string): ToolMetadata | undefined {
    return findToolByName(this.metadataByServer, toolName);
  }

  async authorizeServer(
    serverName: string,
    authorizationCode?: string,
    state?: string
  ): Promise<OAuthAuthorizationResult> {
    const definition = this.getServerDefinition(serverName);
    return authorizeOAuthServer(serverName, definition, authorizationCode, state);
  }

  async connectServer(serverName: string): Promise<void> {
    const definition = this.getServerDefinition(serverName);
    await this.connectAndCacheServer(serverName, definition);
  }

  async refreshServer(serverName: string): Promise<RefreshResult> {
    const definition = this.getServerDefinition(serverName);
    await this.manager.close(serverName);

    try {
      await this.connectAndCacheServer(serverName, definition);
      return {
        serverName,
        status: 'refreshed',
        toolCount: this.metadataByServer.get(serverName)?.length ?? 0,
      };
    } catch (error) {
      return {
        serverName,
        status: 'failed',
        toolCount: this.metadataByServer.get(serverName)?.length ?? 0,
        error: getErrorMessage(error),
      };
    }
  }

  async refreshAllServers(): Promise<RefreshResult[]> {
    const serverNames = Object.keys(this.config.servers);
    return parallelLimit(serverNames, this.config.lifecycle.startupConcurrency, (serverName) =>
      this.refreshServer(serverName)
    );
  }

  async callTool(
    toolName: string,
    argsJson: string | undefined
  ): Promise<AgentToolResult<Record<string, unknown>>> {
    return this.callToolWithArgs(toolName, parseArgsJson(argsJson));
  }

  async callToolWithArgs(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<AgentToolResult<Record<string, unknown>>> {
    const tool = this.describeTool(toolName);
    if (!tool)
      throw new Error(`MCP tool "${toolName}" not found. Use mcp({ search: "..." }) first.`);

    await this.connectServer(tool.serverName);
    if (tool.resourceUri) return this.readResource(tool);

    const result = await this.manager.callTool(tool.serverName, tool.originalName, args);
    return formatMcpCallResult(result, tool);
  }

  private initializeFromCache(): void {
    if (!this.config.metadataCache.enabled) return;

    const cache = loadMetadataCache();
    if (!cache) return;

    for (const [serverName, definition] of Object.entries(this.config.servers)) {
      const entry = cache.servers[serverName];
      if (!isServerCacheValid(entry, definition, this.config.metadataCache.maxAgeHours)) continue;
      this.metadataByServer.set(
        serverName,
        reconstructToolMetadata(serverName, entry, definition, this.config.toolNames.prefix)
      );
    }
  }

  private async connectAndCacheServer(serverName: string, definition: ServerConfig): Promise<void> {
    try {
      const connection = await this.manager.connect(
        serverName,
        withDefaultLifecycle(definition, this.config.lifecycle.defaultMode)
      );
      this.failures.delete(serverName);
      this.setServerMetadata(serverName, connection.tools, connection.resources, definition);
    } catch (error) {
      this.failures.set(serverName, getErrorMessage(error));
      throw error;
    }
  }

  private async connectStartupServers(): Promise<void> {
    const startupServers = Object.entries(this.config.servers).filter(([, definition]) => {
      const lifecycle = definition.lifecycle ?? this.config.lifecycle.defaultMode;
      return lifecycle === 'eager' || lifecycle === 'keep-alive';
    });

    await parallelLimit(
      startupServers,
      this.config.lifecycle.startupConcurrency,
      async ([name]) => {
        try {
          await this.connectServer(name);
        } catch (error) {
          this.failures.set(name, getErrorMessage(error));
        }
      }
    );
  }

  private getServerDefinition(serverName: string): ServerConfig {
    const definition = this.config.servers[serverName];
    if (!definition) throw new Error(`MCP server "${serverName}" is not configured.`);
    return definition;
  }

  private getServerStatus(name: string): ServerStatus {
    const connection = this.manager.getConnection(name);
    const toolCount = this.metadataByServer.get(name)?.length ?? 0;
    const failure = this.failures.get(name);
    if (connection?.status === 'connected') return { name, status: 'connected', toolCount };
    if (failure) return { name, status: 'failed', toolCount, error: failure };
    if (toolCount > 0) return { name, status: 'cached', toolCount };
    return { name, status: 'not connected', toolCount };
  }

  private setServerMetadata(
    serverName: string,
    tools: readonly McpTool[],
    resources: readonly McpResource[],
    definition: ServerConfig
  ): void {
    this.metadataByServer.set(
      serverName,
      buildToolMetadata(tools, resources, definition, serverName, this.config.toolNames.prefix)
    );
    if (!this.config.metadataCache.enabled) return;
    saveServerMetadataCache(serverName, createServerCacheEntry(definition, tools, resources));
  }

  private refreshConnectedServerMetadata(serverName: string): void {
    const connection = this.manager.getConnection(serverName);
    const definition = this.config.servers[serverName];
    if (!connection || !definition) return;
    this.setServerMetadata(serverName, connection.tools, connection.resources, definition);
  }

  private async readResource(
    tool: ToolMetadata
  ): Promise<AgentToolResult<Record<string, unknown>>> {
    if (!tool.resourceUri) throw new Error(`MCP tool "${tool.name}" is not a resource tool.`);
    const result = await this.manager.readResource(tool.serverName, tool.resourceUri);
    const contents = result.contents as McpResourceContent[];
    return {
      content: transformMcpContent(contents),
      details: {
        mode: 'resource',
        server: tool.serverName,
        tool: tool.name,
        uri: tool.resourceUri,
        contentCount: contents.length,
        mimeTypes: contents.map((content) => content.mimeType).filter(Boolean),
      },
    };
  }
}

function withDefaultLifecycle(
  definition: ServerConfig,
  defaultMode: ServerConfig['lifecycle']
): ServerConfig {
  return { ...definition, lifecycle: definition.lifecycle ?? defaultMode };
}

function isSearchMatch(tool: ToolMetadata, lowerQuery: string): boolean {
  return (
    tool.name.toLowerCase().includes(lowerQuery) ||
    tool.description.toLowerCase().includes(lowerQuery)
  );
}

function parseArgsJson(argsJson: string | undefined): Record<string, unknown> {
  if (!argsJson?.trim()) return {};
  const parsed = JSON.parse(argsJson) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MCP tool args must be a JSON object string.');
  }
  return parsed as Record<string, unknown>;
}

function formatMcpCallResult(
  result: unknown,
  tool: ToolMetadata
): AgentToolResult<Record<string, unknown>> {
  const resultRecord =
    result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  const content = Array.isArray(resultRecord.content)
    ? (resultRecord.content as McpContent[])
    : undefined;
  return {
    content: transformMcpContent(content),
    details: { mode: 'call', server: tool.serverName, tool: tool.name, raw: result },
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
