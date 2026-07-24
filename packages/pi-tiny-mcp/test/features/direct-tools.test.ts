import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
  load: vi.fn(),
  isValid: vi.fn(),
}));

vi.mock('#pi-tiny-mcp/core/metadata-cache.js', () => ({
  loadMetadataCache: cache.load,
  isServerCacheValid: cache.isValid,
}));

import type { PiTinyMcpConfig } from '#pi-tiny-mcp/config/schema.js';
import type { TinyMcpRuntime } from '#pi-tiny-mcp/core/runtime.js';
import type { ToolMetadata } from '#pi-tiny-mcp/core/types.js';
import { registerDirectTools, shouldRegisterProxyTool } from '#pi-tiny-mcp/features/direct-tools.js';
import { createTinyMcpConfig } from '#test/utils/config-test-helpers.js';

describe('registerDirectTools', () => {
  beforeEach(() => {
    cache.load.mockReset();
    cache.isValid.mockReset();
  });

  it('registers globally and per-server enabled tools while avoiding proxy collisions', () => {
    const config = createDirectConfig();
    config.directTools.enabled = true;
    config.servers.disabled = { command: 'disabled', directTools: false };
    config.proxyTool.name = 'proxy_collision';
    const tools = [
      createTool('github_search', 'github'),
      createTool('disabled_search', 'disabled'),
      createTool('proxy_collision', 'github'),
    ];
    const registered: RegisteredTool[] = [];

    registerDirectTools(
      { registerTool: (tool: RegisteredTool) => registered.push(tool) } as never,
      config,
      { listTools: () => tools } as TinyMcpRuntime,
      async () => ({}) as TinyMcpRuntime
    );

    expect(registered.map((tool) => tool.name)).toEqual(['github_search']);
  });

  it('allows a server to enable direct tools when the global setting is disabled', () => {
    const config = createDirectConfig();
    config.directTools.enabled = false;
    config.servers.github = { command: 'github', directTools: true };
    const registered: RegisteredTool[] = [];

    registerDirectTools(
      { registerTool: (tool: RegisteredTool) => registered.push(tool) } as never,
      config,
      { listTools: () => [createTool('github_search', 'github')] } as TinyMcpRuntime,
      async () => ({}) as TinyMcpRuntime
    );

    expect(registered).toHaveLength(1);
  });

  it('creates executable tool and resource definitions with parameter fallbacks', async () => {
    const config = createDirectConfig();
    config.directTools.enabled = true;
    const schema = { type: 'object', properties: { query: { type: 'string' } } };
    const tools = [
      createTool('github_search', 'github', { description: 'Search repositories', inputSchema: schema }),
      createTool('docs_readme', 'github', { resourceUri: 'file:///README.md' }),
      createTool('github_invalid', 'github', { inputSchema: 'invalid' }),
    ];
    const registered: RegisteredTool[] = [];
    const callToolWithArgs = vi.fn(async () => ({ content: [], details: {} }));
    const getRuntime = async () => ({ callToolWithArgs }) as unknown as TinyMcpRuntime;

    registerDirectTools(
      { registerTool: (tool: RegisteredTool) => registered.push(tool) } as never,
      config,
      { listTools: () => tools } as TinyMcpRuntime,
      getRuntime
    );

    expect(registered[0]).toMatchObject({
      name: 'github_search',
      label: 'MCP: search',
      description: 'MCP tool from server "github" as "search".\n\nSearch repositories',
      parameters: schema,
    });
    expect(registered[1]?.description).toContain('MCP resource');
    expect(registered[1]?.description).toContain('Resource URI: file:///README.md');
    expect(registered[1]?.parameters).toMatchObject({ type: 'object', properties: {} });
    expect(registered[2]?.parameters).toMatchObject({ type: 'object', properties: {} });

    await registered[0]?.execute('call-1', { query: 'pi' });
    await registered[0]?.execute('call-2', null);

    expect(callToolWithArgs).toHaveBeenNthCalledWith(1, 'github_search', { query: 'pi' });
    expect(callToolWithArgs).toHaveBeenNthCalledWith(2, 'github_search', {});
  });
});

describe('shouldRegisterProxyTool', () => {
  beforeEach(() => {
    cache.load.mockReset();
    cache.isValid.mockReset();
  });

  it('honors proxy and direct-tool switches', () => {
    const config = createDirectConfig();
    config.proxyTool.enabled = false;
    expect(shouldRegisterProxyTool(config)).toBe(false);

    config.proxyTool.enabled = true;
    config.directTools.disableProxyTool = false;
    expect(shouldRegisterProxyTool(config)).toBe(true);

    config.directTools.disableProxyTool = true;
    config.metadataCache.enabled = false;
    expect(shouldRegisterProxyTool(config)).toBe(true);
  });

  it('keeps the proxy when no direct servers or metadata cache exist', () => {
    const config = createDirectConfig();
    config.directTools.disableProxyTool = true;
    config.directTools.enabled = false;

    expect(shouldRegisterProxyTool(config)).toBe(true);

    config.directTools.enabled = true;
    cache.load.mockReturnValue(null);
    expect(shouldRegisterProxyTool(config)).toBe(true);
  });

  it('disables the proxy only when every direct server has valid cached metadata', () => {
    const config = createDirectConfig();
    config.directTools.enabled = true;
    config.directTools.disableProxyTool = true;
    config.servers.docs = { command: 'docs', directTools: false };
    const cacheEntry = { configHash: 'hash', tools: [], resources: [], cachedAt: Date.now() };
    cache.load.mockReturnValue({ version: 1, servers: { github: cacheEntry } });
    cache.isValid.mockReturnValue(true);

    expect(shouldRegisterProxyTool(config)).toBe(false);
    expect(cache.isValid).toHaveBeenCalledWith(cacheEntry, config.servers.github, config.metadataCache.maxAgeHours);

    cache.isValid.mockReturnValue(false);
    expect(shouldRegisterProxyTool(config)).toBe(true);
  });
});

interface RegisteredTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, params: unknown) => Promise<unknown>;
}

function createDirectConfig(): PiTinyMcpConfig {
  return createTinyMcpConfig({
    servers: { github: { command: 'github' } },
    metadataCache: { enabled: true },
  });
}

function createTool(name: string, serverName: string, overrides: Partial<ToolMetadata> = {}): ToolMetadata {
  return {
    name,
    originalName: name.replace(`${serverName}_`, ''),
    serverName,
    description: '',
    ...overrides,
  };
}
