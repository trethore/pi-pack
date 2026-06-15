import { describe, expect, it, vi } from 'vitest';

import type { ToolMetadata } from '#pi-tiny-mcp/core/types.js';
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
