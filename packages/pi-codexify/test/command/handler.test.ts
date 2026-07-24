import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

import { defaultConfig } from '#pi-codexify/config/types.js';
import { registerCommand } from '#pi-codexify/command/register.js';
import { createContext, setCodexCredential } from '#test/utils/codex-credential-test-helpers.js';

describe('codexify reset command', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows usage for /codexify reset without consuming a reset credit', async () => {
    // Arrange
    const command = registerTestCodexifyCommand();
    const ctx = createCommandContext(true);
    const fetchMock = vi.fn(async () => Response.json({ consumed: true }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // Act
    await command.handler('reset', ctx);

    // Assert
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith('Usage: /codexify reset use|details', 'warning');
  });

  it('rejects the removed /codexify reset count action', async () => {
    // Arrange
    const command = registerTestCodexifyCommand();
    const ctx = createCommandContext(true);
    const fetchMock = vi.fn(async () => Response.json({ available_count: 4 }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // Act
    await command.handler('reset count', ctx);

    // Assert
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith('Usage: /codexify reset use|details', 'warning');
  });

  it('routes /codexify reset use to the consume endpoint', async () => {
    // Arrange
    const command = registerTestCodexifyCommand();
    const ctx = createCommandContext(true);
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () => Response.json({ consumed: true }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // Act
    await command.handler('reset use', ctx);

    // Assert
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('routes /codexify reset details to the read-only count endpoint', async () => {
    // Arrange
    const command = registerTestCodexifyCommand();
    const ctx = createCommandContext(true);
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          available_count: 1,
          credits: [{ id: 'RateLimitResetCredit_1234567890', status: 'available' }],
        },
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    // Act
    await command.handler('reset details', ctx);

    // Assert
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume',
      expect.anything()
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('| RateLimitResetCr...7890 | no   | unknown |'),
      'info'
    );
  });
});

describe('codexify command routing', () => {
  it('warns when the extension is disabled', async () => {
    const config = createConfig();
    config.enabled = false;
    const command = registerTestCodexifyCommand(config);
    const ctx = createCommandContext(true);

    await command.handler('status', ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith('pi-codexify is disabled in pi-codexify.jsonc.', 'warning');
  });

  it.each(['', 'help', 'unknown'])('shows help for %j', async (args) => {
    const command = registerTestCodexifyCommand();
    const ctx = createCommandContext(true);

    await command.handler(args, ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('pi-codexify commands'),
      args === 'unknown' ? 'warning' : 'info'
    );
  });

  it('shows enabled and disabled status sections', async () => {
    const enabledCommand = registerTestCodexifyCommand();
    const enabledContext = createCommandContext(true);
    await enabledCommand.handler('status', enabledContext);
    expect(enabledContext.ui.notify).toHaveBeenCalledWith(expect.stringContaining('controls enabled: yes'), 'info');
    expect(enabledContext.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Codex controls'), 'info');

    const disabledConfig = createConfig();
    disabledConfig.controls.enabled = false;
    disabledConfig.usage = false;
    disabledConfig.reset = false;
    const disabledCommand = registerTestCodexifyCommand(disabledConfig);
    const disabledContext = createCommandContext(true);
    await disabledCommand.handler('status', disabledContext);
    expect(disabledContext.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('controls enabled: no\nusage command enabled: no\nreset command enabled: no'),
      'info'
    );
  });

  it.each(['usage', 'reset'] as const)('warns when %s is disabled', async (name) => {
    const config = createConfig();
    config[name] = false;
    const command = registerTestCodexifyCommand(config);
    const ctx = createCommandContext(true);

    await command.handler(name, ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(`codexify ${name} is disabled in pi-codexify.jsonc.`, 'warning');
  });

  it.each(['verbosity', 'reasoning-summary', 'service-tier'] as const)('routes %s controls', async (name) => {
    const command = registerTestCodexifyCommand();
    const ctx = createCommandContext(true);

    await command.handler(`  ${name}  `, ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Codex controls'), 'info');
  });
});

function registerTestCodexifyCommand(config = createConfig()): RegisteredCommand {
  let command: RegisteredCommand | undefined;
  registerCommand(
    {
      registerCommand(_name, registeredCommand) {
        command = registeredCommand;
      },
    } as ExtensionAPI,
    config
  );

  if (!command) throw new Error('codexify command was not registered');
  return command;
}

function createConfig() {
  return {
    ...defaultConfig,
    controls: { ...defaultConfig.controls },
  };
}

function createCommandContext(confirmed: boolean): ReturnType<typeof createContext> & ExtensionCommandContext {
  return {
    ...createContext(),
    ui: {
      confirm: vi.fn(async () => confirmed),
      notify: vi.fn(),
    },
  } as unknown as ReturnType<typeof createContext> & ExtensionCommandContext;
}

type RegisteredCommand = Parameters<ExtensionAPI['registerCommand']>[1];
