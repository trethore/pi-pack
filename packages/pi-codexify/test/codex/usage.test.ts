import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

import { notifyUsage } from '#pi-codexify/codex/usage.js';
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
    await notifyUsage(ctx);

    // Assert
    expect(fetchMock).toHaveBeenCalledWith('https://chatgpt.com/backend-api/wham/usage', {
      headers: {
        accept: '*/*',
        authorization: 'Bearer access-test',
        'chatgpt-account-id': 'account-test',
      },
    });
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'Codex usage\n5h: 25% used / 75% left\n5h reset: 1h 0m\n7d: 50% used / 50% left\n7d reset: 1d 0h',
      'info'
    );
  });

  it.each([
    { primary_window: { used_percent: 50, reset_after_seconds: 86_400 } },
    { primary_window: { used_percent: 50, reset_after_seconds: 86_400 }, secondary_window: null },
    { secondary_window: { used_percent: 50, reset_after_seconds: 86_400 } },
    { primary_window: null, secondary_window: { used_percent: 50, reset_after_seconds: 86_400 } },
  ])('shows only weekly usage when one window is reported: %j', async (rateLimit) => {
    // Arrange
    const ctx = createCommandContext();
    setCodexCredential(ctx, 'test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ rate_limit: rateLimit }))
    );

    // Act
    await notifyUsage(ctx);

    // Assert
    expect(ctx.ui.notify).toHaveBeenCalledWith('Codex usage\n7d: 50% used / 50% left\n7d reset: 1d 0h', 'info');
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
