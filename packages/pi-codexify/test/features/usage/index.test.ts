import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

import { notifyCodexUsage } from '#pi-codexify/features/usage/index.js';
import { createContext, setCodexCredential } from '#test/utils/codex-credential-test-helpers.js';

describe('codex usage command', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests usage through the shared ChatGPT backend API root with active Codex auth', async () => {
    // Arrange
    const ctx = createCommandContext();
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () =>
      Response.json({
        rate_limit: {
          primary_window: { used_percent: 25, reset_after_seconds: 3600 },
          secondary_window: { used_percent: 50, reset_after_seconds: 86_400 },
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    // Act
    await notifyCodexUsage(ctx);

    // Assert
    expect(fetchMock).toHaveBeenCalledWith('https://chatgpt.com/backend-api/wham/usage', {
      headers: {
        accept: '*/*',
        authorization: 'Bearer access-test',
        'chatgpt-account-id': 'account-test',
      },
    });
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Codex usage'), 'info');
  });
});

function createCommandContext(): ReturnType<typeof createContext> & ExtensionCommandContext {
  return {
    ...createContext(),
    ui: {
      notify: vi.fn(),
    },
  } as unknown as ReturnType<typeof createContext> & ExtensionCommandContext;
}
