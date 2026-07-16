import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

import { defaultConfig } from '#pi-codexify/config/schema.js';
import { registerCodexifyCommand } from '#pi-codexify/features/command/index.js';
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

function registerTestCodexifyCommand(): RegisteredCommand {
  let command: RegisteredCommand | undefined;
  registerCodexifyCommand(
    {
      registerCommand(_name, registeredCommand) {
        command = registeredCommand;
      },
    } as ExtensionAPI,
    defaultConfig
  );

  if (!command) throw new Error('codexify command was not registered');
  return command;
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
