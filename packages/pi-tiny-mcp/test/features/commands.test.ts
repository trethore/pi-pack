import { beforeEach, describe, expect, it, vi } from 'vitest';

const metadataCache = vi.hoisted(() => ({ clear: vi.fn() }));

vi.mock('#pi-tiny-mcp/core/metadata-cache.js', async (importOriginal) => ({
  ...(await importOriginal()),
  clearMetadataCache: metadataCache.clear,
}));

import type { TinyMcpRuntime } from '#pi-tiny-mcp/core/runtime.js';
import type { ToolMetadata } from '#pi-tiny-mcp/core/types.js';
import { registerMcpAuthCommand } from '#pi-tiny-mcp/features/mcp-auth-command.js';
import { registerMcpCommand } from '#pi-tiny-mcp/features/mcp-command.js';

describe('/mcp command', () => {
  beforeEach(() => {
    metadataCache.clear.mockReset();
    vi.restoreAllMocks();
  });

  it('clears metadata without starting the runtime', async () => {
    const getRuntime = vi.fn();
    const command = captureCommand(registerMcpCommand, getRuntime);
    const context = createContext();

    await command.handler('cache clear ignored', context);

    expect(metadataCache.clear).toHaveBeenCalledOnce();
    expect(getRuntime).not.toHaveBeenCalled();
    expect(context.ui.notify).toHaveBeenCalledWith(expect.stringContaining('cache cleared'), 'info');
  });

  it('shows empty and populated server status with extra-argument warnings', async () => {
    const emptyRuntime = createRuntime({ getStatus: () => [] });
    const emptyCommand = captureCommand(registerMcpCommand, async () => emptyRuntime);
    const emptyContext = createContext();
    await emptyCommand.handler(undefined, emptyContext);
    expect(emptyContext.ui.notify).toHaveBeenCalledWith('pi-tiny-mcp: no servers configured.', 'info');

    const runtime = createRuntime({
      getStatus: () => [
        { name: 'github', status: 'connected' as const, toolCount: 2 },
        { name: 'docs', status: 'failed' as const, toolCount: 0, error: 'offline' },
      ],
    });
    const command = captureCommand(registerMcpCommand, async () => runtime);
    const context = createContext();

    await command.handler('unknown target extra', context);

    expect(context.ui.notify).toHaveBeenNthCalledWith(1, 'Ignoring extra /mcp arguments after "target".', 'warning');
    expect(context.ui.notify).toHaveBeenNthCalledWith(
      2,
      'github: connected (2 tools)\ndocs: failed (0 tools): offline',
      'info'
    );
  });

  it('reconnects a targeted server and treats a missing target as status', async () => {
    const runtime = createRuntime({
      connectServer: vi.fn(async () => {}),
      getStatus: () => [{ name: 'github', status: 'cached' as const, toolCount: 1 }],
    });
    const command = captureCommand(registerMcpCommand, async () => runtime);
    const context = createContext();

    await command.handler('reconnect github', context);
    await command.handler('reconnect', context);

    expect(runtime.connectServer).toHaveBeenCalledWith('github');
    expect(context.ui.notify).toHaveBeenCalledWith('pi-tiny-mcp reconnected github.', 'info');
    expect(context.ui.notify).toHaveBeenCalledWith('github: cached (1 tools)', 'info');
  });

  it('refreshes all servers and reports failures as warnings', async () => {
    const runtime = createRuntime({
      refreshAllServers: vi.fn(async () => [
        { serverName: 'github', status: 'refreshed' as const, toolCount: 2 },
        { serverName: 'docs', status: 'failed' as const, toolCount: 1, error: 'offline' },
      ]),
    });
    const command = captureCommand(registerMcpCommand, async () => runtime);
    const context = createContext();

    await command.handler('refresh', context);

    expect(runtime.refreshAllServers).toHaveBeenCalledOnce();
    expect(context.ui.notify).toHaveBeenCalledWith(expect.stringContaining('docs: failed'), 'warning');
  });

  it('refreshes one configured server and rejects unknown targets', async () => {
    const runtime = createRuntime({
      hasServer: (name: string) => name === 'github',
      refreshServer: vi.fn(async () => ({ serverName: 'github', status: 'refreshed' as const, toolCount: 3 })),
    });
    const command = captureCommand(registerMcpCommand, async () => runtime);
    const context = createContext();

    await command.handler('refresh missing', context);
    await command.handler('refresh github', context);

    expect(context.ui.notify).toHaveBeenCalledWith('pi-tiny-mcp: server "missing" is not configured.', 'error');
    expect(runtime.refreshServer).toHaveBeenCalledOnce();
    expect(context.ui.notify).toHaveBeenCalledWith('github: refreshed (3 tools)', 'info');
  });

  it('lists empty and described tools', async () => {
    const tool = createTool('github_search', 'Search repositories');
    const runtime = createRuntime({
      listTools: vi.fn((serverName?: string) => (serverName === 'empty' ? [] : [tool, createTool('plain', '')])),
    });
    const command = captureCommand(registerMcpCommand, async () => runtime);
    const context = createContext();

    await command.handler('tools empty', context);
    await command.handler('tools github', context);

    expect(context.ui.notify).toHaveBeenCalledWith('No MCP tools cached.', 'info');
    expect(context.ui.notify).toHaveBeenCalledWith(
      'github_search - Search repositories\nplain - (no description)',
      'info'
    );
  });

  it('logs notifications when no UI is available', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const command = captureCommand(registerMcpCommand, async () => createRuntime({ getStatus: () => [] }));

    await command.handler('', createContext(false));

    expect(log).toHaveBeenCalledWith('pi-tiny-mcp: no servers configured.');
  });
});

describe('/mcp-auth command', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows usage without starting the runtime', async () => {
    const getRuntime = vi.fn();
    const command = captureCommand(registerMcpAuthCommand, getRuntime);
    const context = createContext();

    await command.handler(undefined, context);

    expect(getRuntime).not.toHaveBeenCalled();
    expect(context.ui.notify).toHaveBeenCalledWith(
      'Usage: /mcp-auth <server> [authorization-code-or-redirect-url]',
      'warning'
    );
  });

  it.each([
    { args: 'github code-value', code: 'code-value', state: undefined },
    {
      args: 'github http://127.0.0.1/callback?code=url-code&state=url-state',
      code: 'url-code',
      state: 'url-state',
    },
    {
      args: 'github http://127.0.0.1/callback?state=url-state',
      code: 'http://127.0.0.1/callback?state=url-state',
      state: 'url-state',
    },
  ])('parses authorization input from $args', async ({ args, code, state }) => {
    const runtime = createRuntime({
      authorizeServer: vi.fn(async () => ({ status: 'redirect' as const, authorizationUrl: 'https://authorize' })),
    });
    const command = captureCommand(registerMcpAuthCommand, async () => runtime);
    const context = createContext();

    await command.handler(args, context);

    expect(runtime.authorizeServer).toHaveBeenCalledWith('github', code, state);
    expect(context.ui.notify).toHaveBeenCalledWith(expect.stringContaining('https://authorize'), 'info');
  });

  it('shows a fallback when no authorization URL is available', async () => {
    const runtime = createRuntime({ authorizeServer: async () => ({ status: 'redirect' as const }) });
    const command = captureCommand(registerMcpAuthCommand, async () => runtime);
    const context = createContext();

    await command.handler('github', context);

    expect(context.ui.notify).toHaveBeenCalledWith(expect.stringContaining('(authorization URL unavailable)'), 'info');
  });

  it('reconnects after successful authorization', async () => {
    const runtime = createRuntime({
      authorizeServer: async () => ({ status: 'authorized' as const }),
      connectServer: vi.fn(async () => {}),
    });
    const command = captureCommand(registerMcpAuthCommand, async () => runtime);
    const context = createContext();

    await command.handler('github code', context);

    expect(context.ui.notify).toHaveBeenCalledWith('pi-tiny-mcp OAuth authorized github.', 'info');
    expect(runtime.connectServer).toHaveBeenCalledWith('github');
  });

  it.each([new Error('offline'), 'offline'])('warns when reconnecting fails with %s', async (error) => {
    const runtime = createRuntime({
      authorizeServer: async () => ({ status: 'authorized' as const }),
      connectServer: vi.fn(async () => {
        throw error;
      }),
    });
    const command = captureCommand(registerMcpAuthCommand, async () => runtime);
    const context = createContext();

    await command.handler('github code', context);

    expect(context.ui.notify).toHaveBeenCalledWith('OAuth succeeded, but reconnect failed: offline', 'warning');
  });

  it('logs authorization messages without a UI', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const runtime = createRuntime({ authorizeServer: async () => ({ status: 'redirect' as const }) });
    const command = captureCommand(registerMcpAuthCommand, async () => runtime);

    await command.handler('github', createContext(false));

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Open this URL to authorize github'));
  });
});

interface CapturedCommand {
  handler: (args: string | undefined, context: ReturnType<typeof createContext>) => Promise<void>;
}

function captureCommand(
  register: (pi: never, getRuntime: () => Promise<TinyMcpRuntime>) => void,
  getRuntime: () => Promise<TinyMcpRuntime>
): CapturedCommand {
  let command: CapturedCommand | undefined;
  register(
    {
      registerCommand: (_name: string, definition: CapturedCommand) => {
        command = definition;
      },
    } as never,
    getRuntime
  );
  if (!command) throw new Error('Command was not registered');
  return command;
}

function createContext(hasUI = true) {
  return {
    hasUI,
    ui: { notify: vi.fn() },
  };
}

function createRuntime(overrides: Record<string, unknown>): TinyMcpRuntime {
  return {
    getStatus: () => [],
    hasServer: () => false,
    listTools: () => [],
    refreshAllServers: async () => [],
    ...overrides,
  } as unknown as TinyMcpRuntime;
}

function createTool(name: string, description: string): ToolMetadata {
  return { name, originalName: name, serverName: 'github', description };
}
