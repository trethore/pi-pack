import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

import type { ServerConfig } from '#src/config/schema.js';
import type { McpResource, McpTool, ServerConnection } from '#src/core/types.js';
import {
  interpolateEnvRecord,
  interpolateEnvVars,
  resolveConfigPath,
  resolveProcessEnv,
} from '#src/utils/env.js';

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
    if (definition.url) return this.createHttpConnection(name, definition);
    if (definition.command) {
      return createStartedConnection(name, definition, createStdioTransport(definition));
    }
    throw new Error(`MCP server "${name}" has no command or url`);
  }

  private async createHttpConnection(
    name: string,
    definition: ServerConfig
  ): Promise<ServerConnection> {
    const url = createServerUrl(definition);
    const headers = createHttpHeaders(definition);

    try {
      return await createStartedConnection(
        name,
        definition,
        createStreamableHttpTransport(url, headers)
      );
    } catch (streamableError) {
      if (!shouldTrySseFallback(streamableError)) throw streamableError;

      try {
        return await createStartedConnection(name, definition, createSseTransport(url, headers));
      } catch (sseError) {
        throw new Error(
          `MCP server "${name}" failed to connect with Streamable HTTP and SSE fallback: ${formatErrorMessage(sseError)}`,
          { cause: sseError }
        );
      }
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

function createStreamableHttpTransport(
  url: URL,
  headers: Record<string, string>
): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
  });
}

function createSseTransport(url: URL, headers: Record<string, string>): SSEClientTransport {
  return new SSEClientTransport(url, {
    eventSourceInit: { fetch: createFetchWithHeaders(headers) },
    requestInit: { headers },
  });
}

function createServerUrl(definition: ServerConfig): URL {
  if (!definition.url) throw new Error('MCP HTTP server has no url');
  return new URL(interpolateEnvVars(definition.url));
}

function createHttpHeaders(definition: ServerConfig): Record<string, string> {
  const headers = interpolateEnvRecord(definition.headers) ?? {};
  const bearerToken = resolveBearerToken(definition);
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  return headers;
}

function resolveBearerToken(definition: ServerConfig): string | undefined {
  if (definition.auth !== 'bearer') return undefined;
  if (definition.bearerToken !== undefined) return interpolateEnvVars(definition.bearerToken);
  if (definition.bearerTokenEnv !== undefined) {
    const envName = interpolateEnvVars(definition.bearerTokenEnv);
    const token = process.env[envName];
    if (token === undefined || token === '') {
      throw new Error(`MCP bearer token env var "${envName}" is not set`);
    }
    return interpolateEnvVars(token);
  }
  throw new Error('MCP bearer auth requires bearerToken or bearerTokenEnv');
}

function createFetchWithHeaders(headers: Record<string, string>): typeof fetch {
  return (input, init) => {
    const nextHeaders = new Headers(init?.headers);
    for (const [key, value] of Object.entries(headers)) nextHeaders.set(key, value);
    return fetch(input, { ...init, headers: nextHeaders });
  };
}

function shouldTrySseFallback(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return code === 404 || code === 405;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createStartedConnection(
  name: string,
  definition: ServerConfig,
  transport: Transport
): Promise<ServerConnection> {
  const client = new Client({ name: `pi-tiny-mcp-${name}`, version: '1.0.0' });

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

function createStdioTransport(definition: ServerConfig): StdioClientTransport {
  if (!definition.command) throw new Error('MCP stdio server has no command');
  return new StdioClientTransport({
    command: definition.command,
    args: definition.args ?? [],
    env: resolveProcessEnv(definition.env),
    cwd: resolveConfigPath(definition.cwd),
    stderr: definition.debug ? 'inherit' : 'ignore',
  });
}

function createConnection(
  definition: ServerConfig,
  client: Client,
  transport: Transport,
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
