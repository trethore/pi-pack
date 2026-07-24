import { describe, expect, it, vi } from 'vitest';

import type { ToolMetadata } from '#pi-tiny-mcp/core/types.js';
import { registerProxyTool } from '#pi-tiny-mcp/features/proxy-tool.js';
import { createTinyMcpConfig } from '#test/utils/config-test-helpers.js';
import {
  createRegisteredProxyTool as registerProxyToolForTest,
  executeProxyTool,
} from '#test/utils/proxy-tool-test-helpers.js';

describe('proxy tool error UX', () => {
  it('returns a structured error for invalid JSON args', async () => {
    // Arrange
    const toolMetadata = createToolMetadata('github_search');
    const callToolWithArgs = vi.fn();
    const proxyTool = registerProxyToolForTest({
      describeTool: () => toolMetadata,
      callToolWithArgs,
    });

    // Act
    const result = await executeProxyTool(proxyTool, {
      tool: 'github_search',
      args: '{invalid',
    });

    // Assert
    expect(callToolWithArgs).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ mode: 'call', error: 'invalid_json_args' });
    expect(getText(result)).toContain('Pass args as a JSON object string');
  });

  it('returns a structured error for missing tools', async () => {
    // Arrange
    const proxyTool = registerProxyToolForTest({
      describeTool: vi.fn(),
      getStatus: () => [],
    });

    // Act
    const result = await executeProxyTool(proxyTool, { tool: 'missing_tool', args: '{}' });

    // Assert
    expect(result.details).toMatchObject({
      mode: 'call',
      error: 'tool_not_found',
      tool: 'missing_tool',
    });
    expect(getText(result)).toContain('Use mcp({ search: "keyword" })');
  });

  it('returns a structured error for missing servers', async () => {
    // Arrange
    const connectServer = vi.fn();
    const proxyTool = registerProxyToolForTest({
      getStatus: () => [{ name: 'github', status: 'cached', toolCount: 1 }],
      connectServer,
    });

    // Act
    const result = await executeProxyTool(proxyTool, { connect: 'missing' });

    // Assert
    expect(connectServer).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      mode: 'connect',
      error: 'server_not_found',
      server: 'missing',
    });
    expect(getText(result)).toContain('Run mcp({}) to list configured servers');
  });

  it('refreshes metadata for one server', async () => {
    // Arrange
    const refreshServer = vi.fn(async () => ({
      serverName: 'github',
      status: 'refreshed' as const,
      toolCount: 2,
    }));
    const proxyTool = registerProxyToolForTest({
      getStatus: () => [{ name: 'github', status: 'cached', toolCount: 1 }],
      refreshServer,
    });

    // Act
    const result = await executeProxyTool(proxyTool, { refresh: 'github' });

    // Assert
    expect(refreshServer).toHaveBeenCalledWith('github');
    expect(result.details).toMatchObject({ mode: 'refresh', count: 1, failedCount: 0 });
    expect(getText(result)).toContain('github: refreshed (2 tools)');
  });

  it('refreshes metadata for all servers', async () => {
    // Arrange
    const refreshAllServers = vi.fn(async () => [
      { serverName: 'github', status: 'refreshed' as const, toolCount: 2 },
      { serverName: 'browser', status: 'refreshed' as const, toolCount: 1 },
    ]);
    const proxyTool = registerProxyToolForTest({
      refreshAllServers,
    });

    // Act
    const result = await executeProxyTool(proxyTool, { refresh: 'all' });

    // Assert
    expect(refreshAllServers).toHaveBeenCalled();
    expect(result.details).toMatchObject({ mode: 'refresh', count: 2, failedCount: 0 });
    expect(getText(result)).toContain('browser: refreshed (1 tools)');
  });

  it('returns a structured error for server connection failures', async () => {
    // Arrange
    const proxyTool = registerProxyToolForTest({
      getStatus: () => [{ name: 'github', status: 'not connected', toolCount: 0 }],
      connectServer: async () => {
        throw new Error('spawn npx ENOENT');
      },
    });

    // Act
    const result = await executeProxyTool(proxyTool, { connect: 'github' });

    // Assert
    expect(result.details).toMatchObject({
      mode: 'connect',
      error: 'server_connection_failed',
      server: 'github',
    });
    expect(getText(result)).toContain('Check the server command, url, credentials');
  });
});

describe('proxy tool modes', () => {
  it('does not register when the proxy tool is disabled', () => {
    const registerTool = vi.fn();
    const config = createTinyMcpConfig();
    config.proxyTool.enabled = false;

    registerProxyTool({ registerTool } as never, config, async () => ({}) as never);

    expect(registerTool).not.toHaveBeenCalled();
  });

  it('describes configured servers in the tool definition', () => {
    const tool = registerProxyToolForTest({ getStatus: () => [] });

    expect(tool.description).toContain('Configured servers: github');
  });

  it('formats empty and populated status results', async () => {
    const emptyTool = registerProxyToolForTest({ getStatus: () => [] });
    const emptyResult = await executeProxyTool(emptyTool, {});
    expect(getText(emptyResult)).toBe('MCP: 0/0 servers, 0 tools');

    const populatedTool = registerProxyToolForTest({
      getStatus: () => [
        { name: 'connected', status: 'connected', toolCount: 2 },
        { name: 'failed', status: 'failed', toolCount: 0, error: 'offline' },
        { name: 'cached', status: 'cached', toolCount: 1 },
      ],
    });
    const populatedResult = await executeProxyTool(populatedTool, {});

    expect(getText(populatedResult)).toContain('MCP: 1/3 servers, 3 tools');
    expect(getText(populatedResult)).toContain('+ connected (connected, 2 tools)');
    expect(getText(populatedResult)).toContain('x failed (failed, 0 tools): offline');
    expect(getText(populatedResult)).toContain('- cached (cached, 1 tools)');
  });

  it('rejects JSON primitives and reports primitive call failures', async () => {
    const toolMetadata = createToolMetadata('github_search');
    const invalidTool = registerProxyToolForTest({ describeTool: () => toolMetadata });
    const invalidResult = await executeProxyTool(invalidTool, { tool: 'github_search', args: '[]' });
    expect(invalidResult.details).toMatchObject({ error: 'invalid_json_args' });
    expect(getText(invalidResult)).toContain('expected a JSON object string');

    const failingTool = registerProxyToolForTest({
      describeTool: () => toolMetadata,
      callToolWithArgs: async () => {
        throw 'offline';
      },
    });
    const failingResult = await executeProxyTool(failingTool, { tool: 'github_search' });
    expect(failingResult.details).toMatchObject({ error: 'server_connection_failed', tool: 'github_search' });
    expect(getText(failingResult)).toContain('offline');
  });

  it('connects configured servers and reports available tools', async () => {
    const connectServer = vi.fn(async () => {});
    const tool = registerProxyToolForTest({
      connectServer,
      listTools: () => [createToolMetadata('github_search')],
    });

    const result = await executeProxyTool(tool, { connect: 'github' });

    expect(connectServer).toHaveBeenCalledWith('github');
    expect(result.details).toEqual({ mode: 'connect', server: 'github', toolCount: 1 });
  });

  it('reports failed single-server refreshes and supports the star target', async () => {
    const failedTool = registerProxyToolForTest({
      refreshServer: async () => ({ serverName: 'github', status: 'failed', toolCount: 0 }),
    });
    const failedResult = await executeProxyTool(failedTool, { refresh: 'github' });
    expect(failedResult.details).toMatchObject({ error: 'server_connection_failed' });
    expect(getText(failedResult)).toContain('unknown');

    const refreshAllServers = vi.fn(async () => []);
    const allTool = registerProxyToolForTest({ refreshAllServers });
    await executeProxyTool(allTool, { refresh: '*' });
    expect(refreshAllServers).toHaveBeenCalledOnce();
  });

  it('describes regular tools, resources, and missing tools', async () => {
    const regular = createToolMetadata('github_search');
    const resource = {
      ...createToolMetadata('github_readme'),
      description: '',
      resourceUri: 'file:///README.md',
    };
    const tool = registerProxyToolForTest({
      describeTool: (name: string) => {
        if (name === regular.name) return regular;
        if (name === resource.name) return resource;
        return;
      },
    });

    const regularResult = await executeProxyTool(tool, { describe: regular.name });
    const resourceResult = await executeProxyTool(tool, { describe: resource.name });
    const missingResult = await executeProxyTool(tool, { describe: 'missing' });

    expect(getText(regularResult)).toContain('Parameters:');
    expect(getText(resourceResult)).toContain('Resource: file:///README.md');
    expect(getText(resourceResult)).toContain('(no description)');
    expect(missingResult.details).toMatchObject({ mode: 'describe', error: 'tool_not_found' });
  });

  it('searches and lists empty, populated, and unknown server results', async () => {
    const described = createToolMetadata('github_search');
    const plain = { ...createToolMetadata('github_plain'), description: '', resourceUri: 'file:///plain' };
    const tool = registerProxyToolForTest({
      searchTools: (query: string) => (query === 'none' ? [] : [described, plain]),
      listTools: (server: string) => (server === 'empty' ? [] : [described]),
      hasServer: (server: string) => server !== 'missing',
    });

    expect(getText(await executeProxyTool(tool, { search: 'none' }))).toContain('No MCP tools matched');
    expect(getText(await executeProxyTool(tool, { search: 'github' }))).toContain('Search GitHub');
    expect(getText(await executeProxyTool(tool, { server: 'empty' }))).toContain('No cached tools for empty');
    expect(getText(await executeProxyTool(tool, { server: 'github' }))).toContain('github_search');
    const missingServerResult = await executeProxyTool(tool, { server: 'missing' });
    expect(missingServerResult.details).toMatchObject({
      mode: 'list',
      error: 'server_not_found',
    });
  });
});

function getText(result: Awaited<ReturnType<typeof executeProxyTool>>): string {
  const content = result.content[0];
  return content?.type === 'text' ? content.text : '';
}

function createToolMetadata(name: string): ToolMetadata {
  return {
    name,
    originalName: 'search',
    serverName: 'github',
    description: 'Search GitHub',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  };
}
