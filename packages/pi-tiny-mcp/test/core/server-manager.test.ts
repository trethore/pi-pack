import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  clients: [] as Array<ReturnType<typeof createMockClient>>,
  nextClients: [] as Array<ReturnType<typeof createMockClient>>,
  streamableTransports: [] as MockTransport[],
  sseTransports: [] as MockTransport[],
  stdioTransports: [] as MockTransport[],
}));

vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class Client {
    constructor() {
      const client = sdk.nextClients.shift() ?? createMockClient();
      sdk.clients.push(client);
      return client;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class StreamableHTTPClientTransport {
    constructor(url: URL, options: unknown) {
      const transport = createMockTransport('streamable', url, options);
      sdk.streamableTransports.push(transport);
      return transport;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: class SSEClientTransport {
    constructor(url: URL, options: unknown) {
      const transport = createMockTransport('sse', url, options);
      sdk.sseTransports.push(transport);
      return transport;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class StdioClientTransport {
    constructor(options: unknown) {
      const transport = createMockTransport('stdio', undefined, options);
      sdk.stdioTransports.push(transport);
      return transport;
    }
  },
}));

import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { createDeferred } from '@trethore/pi-shared/test/deferred.js';

import { McpServerManager } from '#pi-tiny-mcp/core/server-manager.js';

beforeEach(() => {
  sdk.clients.length = 0;
  sdk.nextClients.length = 0;
  sdk.streamableTransports.length = 0;
  sdk.sseTransports.length = 0;
  sdk.stdioTransports.length = 0;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('McpServerManager connections', () => {
  it('rejects definitions without a command or URL', async () => {
    const manager = new McpServerManager();

    await expect(manager.connect('invalid', {})).rejects.toThrow('MCP server "invalid" has no command or url');
  });

  it('creates a stdio connection with resolved options and paginated metadata', async () => {
    vi.stubEnv('MCP_ARG', 'resolved');
    vi.stubEnv('MCP_ENV', 'environment');
    const manager = new McpServerManager();
    const firstClient = getNextClient();
    firstClient.listTools
      .mockResolvedValueOnce({ tools: [{ name: 'first' }], nextCursor: 'tools-page-2' })
      .mockResolvedValueOnce({ tools: [{ name: 'second' }] });
    firstClient.listResources
      .mockResolvedValueOnce({ resources: [{ name: 'First', uri: 'file:///first' }], nextCursor: 'resources-page-2' })
      .mockResolvedValueOnce({ resources: [{ name: 'Second', uri: 'file:///second' }] });

    const connection = await manager.connect('stdio', {
      command: 'server',
      args: ['${MCP_ARG}'],
      env: { TOKEN: '$env:MCP_ENV' },
      cwd: '~',
      debug: true,
    });

    expect(connection.tools.map((tool) => tool.name)).toEqual(['first', 'second']);
    expect(connection.resources.map((resource) => resource.name)).toEqual(['First', 'Second']);
    expect(firstClient.listTools.mock.calls[0]).toHaveLength(1);
    expect(firstClient.listTools.mock.calls[0]?.[0]).toBeUndefined();
    expect(firstClient.listTools).toHaveBeenNthCalledWith(2, { cursor: 'tools-page-2' });
    expect(firstClient.listResources).toHaveBeenNthCalledWith(2, { cursor: 'resources-page-2' });
    expect(sdk.stdioTransports[0]?.options).toMatchObject({
      command: 'server',
      args: ['${MCP_ARG}'],
      cwd: process.env.HOME,
      stderr: 'inherit',
      env: { TOKEN: 'environment' },
    });
  });

  it('uses defaults and tolerates unsupported resource listing', async () => {
    const manager = new McpServerManager();
    const firstClient = getNextClient();
    firstClient.listTools.mockResolvedValue({});
    firstClient.listResources.mockRejectedValue(new Error('unsupported'));

    const connection = await manager.connect('stdio', { command: 'server' });

    expect(connection.tools).toEqual([]);
    expect(connection.resources).toEqual([]);
    expect(sdk.stdioTransports[0]?.options).toMatchObject({ args: [], cwd: undefined, stderr: 'ignore' });
  });

  it('shares pending connections and reuses connected instances', async () => {
    const manager = new McpServerManager();
    const firstClient = getNextClient();
    const connectDeferred = createDeferred();
    firstClient.connect.mockReturnValue(connectDeferred.promise);

    const firstConnect = manager.connect('server', { command: 'server' });
    const secondConnect = manager.connect('server', { command: 'server' });
    connectDeferred.resolve();
    const [firstConnection, secondConnection] = await Promise.all([firstConnect, secondConnect]);
    const previousLastUsedAt = firstConnection.lastUsedAt;

    await new Promise((resolve) => setTimeout(resolve, 1));
    const reusedConnection = await manager.connect('server', { command: 'ignored' });

    expect(firstConnection).toBe(secondConnection);
    expect(reusedConnection).toBe(firstConnection);
    expect(reusedConnection.lastUsedAt).toBeGreaterThanOrEqual(previousLastUsedAt);
    expect(sdk.clients).toHaveLength(1);
  });

  it('cleans up failed connections before rethrowing', async () => {
    const manager = new McpServerManager();
    const firstClient = getNextClient();
    firstClient.connect.mockRejectedValue(new Error('connect failed'));

    await expect(manager.connect('server', { command: 'server' })).rejects.toThrow('connect failed');

    expect(firstClient.close).toHaveBeenCalledOnce();
    expect(sdk.stdioTransports[0]?.close).toHaveBeenCalledOnce();
    expect(manager.getConnection('server')).toBeUndefined();
  });
});

describe('McpServerManager HTTP authentication and fallback', () => {
  it('creates streamable HTTP transports with interpolated headers and literal bearer tokens', async () => {
    vi.stubEnv('MCP_HOST', 'example.test');
    vi.stubEnv('MCP_HEADER', 'header-value');
    const manager = new McpServerManager();
    getNextClient();

    await manager.connect('http', {
      url: 'https://${MCP_HOST}/mcp',
      headers: { 'X-Test': '$env:MCP_HEADER' },
      auth: 'bearer',
      bearerToken: '${MCP_HEADER}',
    });

    expect(sdk.streamableTransports[0]?.url?.toString()).toBe('https://example.test/mcp');
    expect(sdk.streamableTransports[0]?.options).toEqual({
      authProvider: undefined,
      requestInit: { headers: { 'X-Test': 'header-value', Authorization: 'Bearer header-value' } },
    });
  });

  it('resolves bearer token environment names and rejects missing tokens', async () => {
    vi.stubEnv('TOKEN_NAME', 'MCP_TOKEN');
    vi.stubEnv('MCP_TOKEN', 'secret');
    const manager = new McpServerManager();
    getNextClient();

    await manager.connect('http', {
      url: 'https://example.test',
      auth: 'bearer',
      bearerTokenEnv: '${TOKEN_NAME}',
    });

    expect(sdk.streamableTransports[0]?.options).toMatchObject({
      requestInit: { headers: { Authorization: 'Bearer secret' } },
    });

    await expect(
      new McpServerManager().connect('missing', {
        url: 'https://example.test',
        auth: 'bearer',
        bearerTokenEnv: 'MISSING_TOKEN',
      })
    ).rejects.toThrow('MCP bearer token env var "MISSING_TOKEN" is not set');
    await expect(
      new McpServerManager().connect('missing', { url: 'https://example.test', auth: 'bearer' })
    ).rejects.toThrow('MCP bearer auth requires bearerToken or bearerTokenEnv');
  });

  it.each([404, 405])('falls back to SSE for HTTP error code %s', async (code) => {
    const manager = new McpServerManager();
    const streamableClient = getNextClient();
    streamableClient.connect.mockRejectedValue(Object.assign(new Error('not supported'), { code }));
    getNextClient();

    const connection = await manager.connect('http', { url: 'https://example.test' });

    expect(connection.status).toBe('connected');
    expect(sdk.streamableTransports).toHaveLength(1);
    expect(sdk.sseTransports).toHaveLength(1);
  });

  it('does not fall back for unrelated or primitive errors', async () => {
    const manager = new McpServerManager();
    getNextClient().connect.mockRejectedValue(new Error('network failed'));

    await expect(manager.connect('http', { url: 'https://example.test' })).rejects.toThrow('network failed');
    expect(sdk.sseTransports).toHaveLength(0);

    getNextClient().connect.mockRejectedValue('offline');
    await expect(new McpServerManager().connect('primitive', { url: 'https://example.test' })).rejects.toBe('offline');
  });

  it.each([
    { auth: 'oauth' as const, message: 'requires OAuth authorization' },
    { auth: 'bearer' as const, bearerToken: 'token', message: 'rejected bearer auth' },
    { auth: undefined, message: 'requires authentication' },
  ])('formats unauthorized errors for $auth authentication', async (definition) => {
    const manager = new McpServerManager();
    getNextClient().connect.mockRejectedValue(new UnauthorizedError('unauthorized'));

    await expect(
      manager.connect('secure', {
        url: 'https://example.test',
        auth: definition.auth,
        bearerToken: definition.bearerToken,
      })
    ).rejects.toThrow(definition.message);
  });

  it('reports a formatted SSE fallback failure', async () => {
    const manager = new McpServerManager();
    getNextClient().connect.mockRejectedValue(Object.assign(new Error('missing'), { code: 404 }));
    getNextClient().connect.mockRejectedValue('SSE offline');

    await expect(manager.connect('http', { url: 'https://example.test' })).rejects.toThrow(
      'failed to connect with Streamable HTTP and SSE fallback: SSE offline'
    );
  });
});

describe('McpServerManager usage and lifecycle', () => {
  it('tracks tool and resource usage for success and failure', async () => {
    const manager = new McpServerManager();
    const client = getNextClient();
    client.callTool.mockResolvedValue({ content: [] });
    client.readResource.mockRejectedValue(new Error('read failed'));
    const connection = await manager.connect('server', { command: 'server' });

    await expect(manager.callTool('server', 'search', { query: 'pi' })).resolves.toEqual({ content: [] });
    await expect(manager.readResource('server', 'file:///README.md')).rejects.toThrow('read failed');

    expect(client.callTool).toHaveBeenCalledWith({ name: 'search', arguments: { query: 'pi' } });
    expect(client.readResource).toHaveBeenCalledWith({ uri: 'file:///README.md' });
    expect(connection.inFlight).toBe(0);
  });

  it('rejects operations for disconnected servers', async () => {
    const manager = new McpServerManager();

    await expect(manager.callTool('missing', 'search', {})).rejects.toThrow('MCP server "missing" is not connected');
  });

  it('evaluates every idle condition', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const manager = new McpServerManager();

    expect(manager.isIdle('missing', 100)).toBe(false);

    getNextClient();
    const connection = await manager.connect('server', { command: 'server' });
    connection.status = 'closed';
    expect(manager.isIdle('server', 100)).toBe(false);
    connection.status = 'connected';
    connection.inFlight = 1;
    expect(manager.isIdle('server', 100)).toBe(false);
    connection.inFlight = 0;
    connection.lastUsedAt = 9950;
    expect(manager.isIdle('server', 100)).toBe(false);
    connection.lastUsedAt = 9800;
    expect(manager.isIdle('server', 100)).toBe(true);
  });

  it('closes one or all connections and ignores close failures', async () => {
    const manager = new McpServerManager();
    const firstClient = getNextClient();
    const first = await manager.connect('first', { command: 'first' });
    const secondClient = getNextClient();
    await manager.connect('second', { command: 'second' });
    firstClient.close.mockRejectedValue(new Error('client close failed'));
    sdk.stdioTransports[0]?.close.mockRejectedValue(new Error('transport close failed'));

    await manager.close('missing');
    await manager.close('first');
    await manager.closeAll();

    expect(first.status).toBe('closed');
    expect(manager.getConnection('first')).toBeUndefined();
    expect(manager.getConnection('second')).toBeUndefined();
    expect(secondClient.close).toHaveBeenCalledOnce();
  });
});

interface MockTransport {
  kind: string;
  url?: URL;
  options: Record<string, unknown>;
  close: ReturnType<typeof vi.fn>;
}

function createMockTransport(kind: string, url?: URL, options?: unknown): MockTransport {
  return {
    kind,
    url,
    options: (options ?? {}) as Record<string, unknown>,
    close: vi.fn(async () => {}),
  };
}

function createMockClient() {
  return {
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    listTools: vi.fn<
      (params?: { cursor: string }) => Promise<{ tools?: Array<{ name: string }>; nextCursor?: string }>
    >(async () => ({ tools: [] })),
    listResources: vi.fn<
      (params?: {
        cursor: string;
      }) => Promise<{ resources?: Array<{ name: string; uri: string }>; nextCursor?: string }>
    >(async () => ({ resources: [] })),
    callTool: vi.fn(async () => ({})),
    readResource: vi.fn(async () => ({ contents: [] })),
  };
}

function getNextClient(): ReturnType<typeof createMockClient> {
  const client = createMockClient();
  sdk.nextClients.push(client);
  return client;
}
