import { describe, expect, it, vi } from 'vitest';

import { TinyMcpRuntime } from '#pi-tiny-mcp/core/runtime.js';
import type { McpTool, ServerConnection, ToolMetadata } from '#pi-tiny-mcp/core/types.js';
import { createTinyMcpConfig } from '#test/utils/config-test-helpers.js';

describe('TinyMcpRuntime metadata', () => {
  it('lists, searches, and describes tools across servers', () => {
    const runtime = createRuntime({ github: { command: 'github' }, docs: { command: 'docs' } });
    const githubTool = createToolMetadata('github_search', 'github', 'Search repositories');
    const docsTool = createToolMetadata('docs_read', 'docs', 'Read documentation');
    runtime.metadataByServer.set('github', [githubTool]);
    runtime.metadataByServer.set('docs', [docsTool]);

    expect(runtime.hasServer('github')).toBe(true);
    expect(runtime.hasServer('missing')).toBe(false);
    expect(runtime.listTools('github')).toEqual([githubTool]);
    expect(runtime.listTools('missing')).toEqual([]);
    expect(runtime.listTools()).toEqual([githubTool, docsTool]);
    expect(runtime.searchTools('REPOSITORIES')).toEqual([githubTool]);
    expect(runtime.searchTools('DOCS')).toEqual([docsTool]);
    expect(runtime.describeTool('github_search')).toBe(githubTool);
    expect(runtime.describeTool('missing')).toBeUndefined();
  });

  it('reports connected, failed, cached, and disconnected server statuses', () => {
    const runtime = createRuntime({
      connected: { command: 'connected' },
      failed: { command: 'failed' },
      cached: { command: 'cached' },
      disconnected: { command: 'disconnected' },
    });
    runtime.metadataByServer.set('connected', [createToolMetadata('connected_tool', 'connected')]);
    runtime.metadataByServer.set('failed', [createToolMetadata('failed_tool', 'failed')]);
    runtime.metadataByServer.set('cached', [createToolMetadata('cached_tool', 'cached')]);
    runtime.failures.set('failed', 'connection failed');
    vi.spyOn(runtime.manager, 'getConnection').mockImplementation((name) =>
      name === 'connected' ? createConnection() : undefined
    );

    expect(runtime.getStatus()).toEqual([
      { name: 'connected', status: 'connected', toolCount: 1 },
      { name: 'failed', status: 'failed', toolCount: 1, error: 'connection failed' },
      { name: 'cached', status: 'cached', toolCount: 1 },
      { name: 'disconnected', status: 'not connected', toolCount: 0 },
    ]);
  });
});

describe('TinyMcpRuntime connections', () => {
  it('connects a configured server and stores generated metadata', async () => {
    const runtime = createRuntime({ github: { command: 'github' } });
    runtime.failures.set('github', 'old failure');
    vi.spyOn(runtime.manager, 'connect').mockResolvedValue(
      createConnection([{ name: 'search', description: 'Search repositories' }])
    );

    await runtime.connectServer('github');

    expect(runtime.failures.has('github')).toBe(false);
    expect(runtime.listTools('github')).toMatchObject([
      { name: 'github_search', originalName: 'search', description: 'Search repositories' },
    ]);
  });

  it('rejects unknown servers', async () => {
    const runtime = createRuntime({});

    await expect(runtime.connectServer('missing')).rejects.toThrow('MCP server "missing" is not configured.');
    await expect(runtime.refreshServer('missing')).rejects.toThrow('MCP server "missing" is not configured.');
    await expect(runtime.authorizeServer('missing')).rejects.toThrow('MCP server "missing" is not configured.');
  });

  it('returns refresh success and failure results without discarding cached metadata', async () => {
    const runtime = createRuntime({ success: { command: 'success' }, failure: { command: 'failure' } });
    runtime.metadataByServer.set('failure', [createToolMetadata('failure_cached', 'failure')]);
    vi.spyOn(runtime.manager, 'close').mockResolvedValue();
    vi.spyOn(runtime.manager, 'connect').mockImplementation(async (name) => {
      if (name === 'failure') throw 'offline';
      return createConnection([{ name: 'search' }]);
    });

    const success = await runtime.refreshServer('success');
    const failure = await runtime.refreshServer('failure');

    expect(success).toEqual({ serverName: 'success', status: 'refreshed', toolCount: 1 });
    expect(failure).toEqual({ serverName: 'failure', status: 'failed', toolCount: 1, error: 'offline' });
  });

  it('refreshes every configured server', async () => {
    const runtime = createRuntime({ first: { command: 'first' }, second: { command: 'second' } });
    const refreshServer = vi.spyOn(runtime, 'refreshServer').mockImplementation(async (serverName) => ({
      serverName,
      status: 'refreshed',
      toolCount: 0,
    }));

    const results = await runtime.refreshAllServers();

    expect(results).toEqual([
      { serverName: 'first', status: 'refreshed', toolCount: 0 },
      { serverName: 'second', status: 'refreshed', toolCount: 0 },
    ]);
    expect(refreshServer).toHaveBeenCalledTimes(2);
  });

  it('registers lifecycle defaults and connects only startup servers', async () => {
    const config = createTinyMcpConfig({
      servers: {
        lazy: { command: 'lazy' },
        eager: { command: 'eager', lifecycle: 'eager' },
        persistent: { command: 'persistent', lifecycle: 'keep-alive' },
      },
      metadataCache: { enabled: false },
    });
    const runtime = new TinyMcpRuntime(config);
    const registerServer = vi.spyOn(runtime.lifecycle, 'registerServer');
    const lifecycleStart = vi.spyOn(runtime.lifecycle, 'start').mockImplementation(() => {});
    vi.spyOn(runtime.manager, 'connect').mockResolvedValue(createConnection());

    await runtime.start();

    expect(registerServer).toHaveBeenCalledWith('lazy', { command: 'lazy', lifecycle: 'lazy' });
    expect(registerServer).toHaveBeenCalledWith('eager', { command: 'eager', lifecycle: 'eager' });
    expect(registerServer).toHaveBeenCalledWith('persistent', {
      command: 'persistent',
      lifecycle: 'keep-alive',
    });
    expect(runtime.manager.connect).toHaveBeenCalledTimes(2);
    expect(lifecycleStart).toHaveBeenCalledOnce();
  });

  it('records startup failures and delegates shutdown', async () => {
    const config = createTinyMcpConfig({
      servers: { eager: { command: 'eager', lifecycle: 'eager' } },
      metadataCache: { enabled: false },
    });
    const runtime = new TinyMcpRuntime(config);
    vi.spyOn(runtime.lifecycle, 'start').mockImplementation(() => {});
    vi.spyOn(runtime.manager, 'connect').mockRejectedValue('startup failed');
    const shutdown = vi.spyOn(runtime.lifecycle, 'shutdown').mockResolvedValue();

    await runtime.start();
    await runtime.shutdown();

    expect(runtime.failures.get('eager')).toBe('startup failed');
    expect(shutdown).toHaveBeenCalledOnce();
  });
});

describe('TinyMcpRuntime tool calls', () => {
  it.each([
    { argsJson: undefined, expected: {} },
    { argsJson: '', expected: {} },
    { argsJson: '  ', expected: {} },
    { argsJson: '{"query":"pi"}', expected: { query: 'pi' } },
  ])('parses tool arguments from $argsJson', async ({ argsJson, expected }) => {
    const runtime = createCallableRuntime();
    const callTool = vi.spyOn(runtime.manager, 'callTool').mockResolvedValue({ content: [] });

    await runtime.callTool('github_search', argsJson);

    expect(callTool).toHaveBeenCalledWith('github', 'search', expected);
  });

  it.each(['null', '[]', '"text"', '1'])('rejects non-object tool arguments: %s', async (argsJson) => {
    const runtime = createCallableRuntime();

    await expect(runtime.callTool('github_search', argsJson)).rejects.toThrow(
      'MCP tool args must be a JSON object string.'
    );
  });

  it('rejects unknown tools', async () => {
    const runtime = createRuntime({ github: { command: 'github' } });

    await expect(runtime.callToolWithArgs('missing', {})).rejects.toThrow(
      'MCP tool "missing" not found. Use mcp({ search: "..." }) first.'
    );
  });

  it.each([
    { result: undefined, expected: '(empty MCP result)' },
    { result: 'plain result', expected: '(empty MCP result)' },
    { result: { content: 'invalid' }, expected: '(empty MCP result)' },
    { result: { content: [{ type: 'text', text: 'done' }] }, expected: 'done' },
  ])('formats MCP call result variants', async ({ result, expected }) => {
    const runtime = createCallableRuntime();
    vi.spyOn(runtime.manager, 'callTool').mockResolvedValue(result);

    const response = await runtime.callToolWithArgs('github_search', {});

    expect(response.content).toEqual([{ type: 'text', text: expected }]);
    expect(response.details).toEqual({
      mode: 'call',
      server: 'github',
      tool: 'github_search',
      raw: result,
    });
  });
});

function createRuntime(servers: Record<string, { command: string; lifecycle?: 'lazy' | 'eager' | 'keep-alive' }>) {
  return new TinyMcpRuntime(createTinyMcpConfig({ servers, metadataCache: { enabled: false } }));
}

function createCallableRuntime(): TinyMcpRuntime {
  const runtime = createRuntime({ github: { command: 'github' } });
  runtime.metadataByServer.set('github', [createToolMetadata('github_search', 'github')]);
  vi.spyOn(runtime.manager, 'connect').mockResolvedValue(createConnection());
  return runtime;
}

function createToolMetadata(name: string, serverName: string, description = ''): ToolMetadata {
  return { name, originalName: name.replace(`${serverName}_`, ''), serverName, description };
}

function createConnection(tools: McpTool[] = []): ServerConnection {
  return {
    client: {} as ServerConnection['client'],
    transport: {} as ServerConnection['transport'],
    definition: {},
    tools,
    resources: [],
    lastUsedAt: Date.now(),
    inFlight: 0,
    status: 'connected',
  };
}
