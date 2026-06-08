import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultConfig, type PiTinyMcpConfig } from '#pi-tiny-mcp/config/schema.js';
import { McpLifecycleManager } from '#pi-tiny-mcp/core/lifecycle.js';
import { buildToolMetadata } from '#pi-tiny-mcp/core/tool-metadata.js';
import type { McpTool } from '#pi-tiny-mcp/core/types.js';

describe('runtime and feature tests', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it.each([
    { prefix: 'server' as const, serverName: 'github-mcp', expected: 'github_mcp_search' },
    { prefix: 'short' as const, serverName: 'github-mcp', expected: 'github_search' },
    { prefix: 'none' as const, serverName: 'github-mcp', expected: 'search' },
  ])('formats tool names for $prefix prefix', ({ prefix, serverName, expected }) => {
    // Arrange
    const tools: McpTool[] = [{ name: 'search', description: 'Search' }];

    // Act
    const metadata = buildToolMetadata(tools, [], {}, serverName, prefix);

    // Assert
    expect(metadata[0]?.name).toBe(expected);
    expect(metadata[0]?.originalName).toBe('search');
    expect(metadata[0]?.serverName).toBe(serverName);
  });

  it('ignores metadata cache entries when server config changes', async () => {
    // Arrange
    const homeDir = await makeTempDir();
    const { saveServerMetadataCache, createServerCacheEntry } = await importCacheWithHome(homeDir);
    const oldDefinition = { command: 'npx', args: ['old-server'] };
    const newDefinition = { command: 'npx', args: ['new-server'] };
    const tools: McpTool[] = [{ name: 'search', description: 'Search old server' }];
    saveServerMetadataCache('github', createServerCacheEntry(oldDefinition, tools, []));

    const { TinyMcpRuntime } = await import('#pi-tiny-mcp/core/runtime.js');

    // Act
    const runtime = new TinyMcpRuntime(
      createConfig({ servers: { github: newDefinition }, metadataCache: { enabled: true } })
    );

    // Assert
    expect(runtime.listTools('github')).toEqual([]);
  });

  it('routes proxy modes to the matching runtime operation', async () => {
    // Arrange
    const toolMetadata = {
      name: 'github_search',
      originalName: 'search',
      serverName: 'github',
      description: 'Search GitHub',
      inputSchema: { type: 'object' },
    };
    const runtime = {
      getStatus: vi.fn(() => [{ name: 'github', status: 'cached', toolCount: 1 }]),
      hasServer: vi.fn((serverName: string) => serverName === 'github'),
      listTools: vi.fn(() => [toolMetadata]),
      searchTools: vi.fn(() => [toolMetadata]),
      describeTool: vi.fn(() => toolMetadata),
      callToolWithArgs: vi.fn(async () => ({
        content: [{ type: 'text' as const, text: 'ok' }],
        details: { mode: 'call' },
      })),
    };
    const proxyTool = await createRegisteredProxyTool(runtime);

    // Act
    const status = await executeProxyTool(proxyTool, {});
    const list = await executeProxyTool(proxyTool, { server: 'github' });
    const search = await executeProxyTool(proxyTool, { search: 'git' });
    const describe = await executeProxyTool(proxyTool, { describe: 'github_search' });
    const call = await executeProxyTool(proxyTool, {
      tool: 'github_search',
      args: '{"query":"pi"}',
    });

    // Assert
    expect(status.details).toMatchObject({ mode: 'status' });
    expect(list.details).toMatchObject({ mode: 'list', server: 'github' });
    expect(search.details).toMatchObject({ mode: 'search', query: 'git' });
    expect(describe.details).toMatchObject({ mode: 'describe' });
    expect(call.details).toMatchObject({ mode: 'call' });
    expect(runtime.listTools).toHaveBeenCalledWith('github');
    expect(runtime.searchTools).toHaveBeenCalledWith('git');
    expect(runtime.describeTool).toHaveBeenCalledWith('github_search');
    expect(runtime.callToolWithArgs).toHaveBeenCalledWith('github_search', { query: 'pi' });
  });

  it('shuts down idle non-keep-alive servers during lifecycle checks', async () => {
    // Arrange
    vi.useFakeTimers();
    const manager = {
      getConnection: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(async () => {}),
      closeAll: vi.fn(async () => {}),
      isIdle: vi.fn(() => true),
    };
    const onConnectionChanged = vi.fn();
    const lifecycle = new McpLifecycleManager(
      manager as never,
      { defaultMode: 'lazy', idleTimeoutMinutes: 1, healthCheckSeconds: 5, startupConcurrency: 1 },
      onConnectionChanged
    );
    lifecycle.registerServer('github', { command: 'npx', lifecycle: 'lazy' });

    // Act
    lifecycle.start();
    await vi.advanceTimersByTimeAsync(5000);
    await lifecycle.shutdown();

    // Assert
    expect(manager.isIdle).toHaveBeenCalledWith('github', 60_000);
    expect(manager.close).toHaveBeenCalledWith('github');
    expect(onConnectionChanged).toHaveBeenCalledWith('github');
  });

  it('tracks connect failures in server status', async () => {
    // Arrange
    const { TinyMcpRuntime } = await import('#pi-tiny-mcp/core/runtime.js');
    const runtime = new TinyMcpRuntime(
      createConfig({
        servers: { github: { command: 'missing-command' } },
        metadataCache: { enabled: false },
      })
    );
    vi.spyOn(runtime.manager, 'connect').mockRejectedValue(new Error('spawn ENOENT'));

    // Act
    await expect(runtime.connectServer('github')).rejects.toThrow('spawn ENOENT');

    // Assert
    expect(runtime.getStatus()).toEqual([{ name: 'github', status: 'failed', toolCount: 0, error: 'spawn ENOENT' }]);
  });
});

async function importCacheWithHome(homeDir: string) {
  vi.resetModules();
  vi.doMock('node:os', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:os')>()),
    homedir: () => homeDir,
  }));
  return import('#pi-tiny-mcp/core/metadata-cache.js');
}

type RegisteredTool = Parameters<ExtensionAPI['registerTool']>[0];

async function createRegisteredProxyTool(runtime: Record<string, unknown>): Promise<RegisteredTool> {
  const { registerProxyTool } = await import('#pi-tiny-mcp/features/proxy-tool.js');
  let registeredTool: RegisteredTool | undefined;
  const pi = {
    registerTool(tool: RegisteredTool) {
      registeredTool = tool;
    },
  } as Pick<ExtensionAPI, 'registerTool'> as ExtensionAPI;

  registerProxyTool(pi, createConfig({ servers: { github: { command: 'npx' } } }), async () => runtime as never);
  if (!registeredTool) throw new Error('proxy tool was not registered');
  return registeredTool;
}

async function executeProxyTool(tool: RegisteredTool, params: Record<string, unknown>) {
  return tool.execute('tool-call-id', params as never, undefined, undefined, undefined as never);
}

function createConfig(
  overrides: {
    servers?: PiTinyMcpConfig['servers'];
    metadataCache?: Partial<PiTinyMcpConfig['metadataCache']>;
  } = {}
): PiTinyMcpConfig {
  return {
    ...defaultConfig,
    proxyTool: { ...defaultConfig.proxyTool },
    directTools: { ...defaultConfig.directTools },
    metadataCache: { ...defaultConfig.metadataCache, ...overrides.metadataCache },
    lifecycle: { ...defaultConfig.lifecycle },
    toolNames: { ...defaultConfig.toolNames },
    sources: { ...defaultConfig.sources },
    servers: overrides.servers ?? {},
  };
}

async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'pi-tiny-mcp-test-'));
}
