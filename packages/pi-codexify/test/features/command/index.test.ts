import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

import { defaultConfig } from '#pi-codexify/config/schema.js';
import type { CodexControlsController } from '#pi-codexify/features/codex-controls/index.js';
import { registerCodexifyCommand } from '#pi-codexify/features/command/index.js';
import { createContext, setCodexCredential } from '#test/utils/account-test-helpers.js';

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
    expect(ctx.ui.notify).toHaveBeenCalledWith('Usage: /codexify reset use|count', 'warning');
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

  it('routes /codexify reset count to the count endpoint', async () => {
    // Arrange
    const command = registerTestCodexifyCommand();
    const ctx = createCommandContext(true);
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () => Response.json({ available_count: 4 }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // Act
    await command.handler('reset count', ctx);

    // Assert
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits',
      expect.objectContaining({ method: 'GET' })
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith('You have 4 reset tokens available.', 'info');
  });
});

function registerTestCodexifyCommand(): RegisteredCommand {
  let command: RegisteredCommand | undefined;
  registerCodexifyCommand(
    {
      registerCommand(_name, registeredCommand) {
        command = registeredCommand;
      },
    } as ExtensionAPI,
    defaultConfig,
    createCodexControlsController()
  );

  if (!command) throw new Error('codexify command was not registered');
  return command;
}

function createCodexControlsController(): CodexControlsController {
  return {
    getConfig: () => defaultConfig.codex,
    updateReasoningSummary: vi.fn(),
    updateVerbosity: vi.fn(),
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
