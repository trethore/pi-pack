import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

import type { ServerConfig } from '#src/config/schema.js';
import type { McpResource, McpTool, ServerConnection } from '#src/core/types.js';
import { resolveConfigPath, resolveProcessEnv } from '#src/utils/env.js';

export class McpServerManager {
  private readonly connections = new Map<string, ServerConnection>();
  private readonly connectPromises = new Map<string, Promise<ServerConnection>>();

  async connect(name: string, definition: ServerConfig): Promise<ServerConnection> {
    const pending = this.connectPromises.get(name);
    if (pending) return pending;

    const existing = this.connections.get(name);
    if (existing?.status === 'connected') {
      existing.lastUsedAt = Date.now();
      return existing;
    }

    const promise = this.createConnection(name, definition);
    this.connectPromises.set(name, promise);

    try {
      const connection = await promise;
      this.connections.set(name, connection);
      return connection;
    } finally {
      this.connectPromises.delete(name);
    }
  }

  async callTool(name: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return this.runWithUsageTracking(name, (connection) =>
      connection.client.callTool({ name: toolName, arguments: args })
    );
  }

  async readResource(name: string, uri: string): Promise<ReadResourceResult> {
    return this.runWithUsageTracking(name, (connection) => connection.client.readResource({ uri }));
  }

  async close(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) return;

    connection.status = 'closed';
    this.connections.delete(name);
    await connection.client.close().catch(() => {});
    await connection.transport.close().catch(() => {});
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((name) => this.close(name)));
  }

  getConnection(name: string): ServerConnection | undefined {
    return this.connections.get(name);
  }

  isIdle(name: string, timeoutMs: number): boolean {
    const connection = this.connections.get(name);
    if (!connection || connection.status !== 'connected') return false;
    if (connection.inFlight > 0) return false;
    return Date.now() - connection.lastUsedAt > timeoutMs;
  }

  private async createConnection(
    name: string,
    definition: ServerConfig
  ): Promise<ServerConnection> {
    if (!definition.command) throw new Error(`MCP server "${name}" has no command`);

    const client = new Client({ name: `pi-tiny-mcp-${name}`, version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: definition.command,
      args: definition.args ?? [],
      env: resolveProcessEnv(definition.env),
      cwd: resolveConfigPath(definition.cwd),
      stderr: definition.debug ? 'inherit' : 'ignore',
    });

    try {
      await client.connect(transport);
      const [tools, resources] = await Promise.all([
        fetchAllTools(client),
        fetchAllResources(client),
      ]);
      return createConnection(definition, client, transport, tools, resources);
    } catch (error) {
      await client.close().catch(() => {});
      await transport.close().catch(() => {});
      throw error;
    }
  }

  private getConnectedConnection(name: string): ServerConnection {
    const connection = this.connections.get(name);
    if (!connection || connection.status !== 'connected') {
      throw new Error(`MCP server "${name}" is not connected`);
    }
    return connection;
  }

  private async runWithUsageTracking<T>(
    name: string,
    run: (connection: ServerConnection) => Promise<T>
  ): Promise<T> {
    const connection = this.getConnectedConnection(name);
    connection.inFlight += 1;
    connection.lastUsedAt = Date.now();

    try {
      return await run(connection);
    } finally {
      connection.inFlight -= 1;
      connection.lastUsedAt = Date.now();
    }
  }
}

async function fetchAllTools(client: Client): Promise<McpTool[]> {
  const tools: McpTool[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...((result.tools ?? []) as McpTool[]));
    cursor = result.nextCursor;
  } while (cursor);

  return tools;
}

async function fetchAllResources(client: Client): Promise<McpResource[]> {
  try {
    const resources: McpResource[] = [];
    let cursor: string | undefined;

    do {
      const result = await client.listResources(cursor ? { cursor } : undefined);
      resources.push(...((result.resources ?? []) as McpResource[]));
      cursor = result.nextCursor;
    } while (cursor);

    return resources;
  } catch {
    return [];
  }
}

function createConnection(
  definition: ServerConfig,
  client: Client,
  transport: StdioClientTransport,
  tools: McpTool[],
  resources: McpResource[]
): ServerConnection {
  return {
    client,
    transport,
    definition,
    tools,
    resources,
    lastUsedAt: Date.now(),
    inFlight: 0,
    status: 'connected',
  };
}
