import { describe, expect, it, vi } from 'vitest';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

import {
  consumeResetCredit,
  countResetCredits,
  handleResetCreditCountCommand,
  handleUseResetCreditCommand,
} from '#pi-codexify/features/reset-credit/index.js';
import { createContext, setCodexCredential } from '#test/utils/account-test-helpers.js';

describe('use reset credit command', () => {
  it('posts the consume request with the active Codex OAuth token', async () => {
    // Arrange
    const ctx = createContext();
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () => Response.json({ consumed: true }, { status: 200 }));

    // Act
    const result = await consumeResetCredit(ctx, {
      fetch: fetchMock,
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
    });

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://chatgpt.com/wham/rate-limit-reset-credits/consume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OAI-Language': 'en',
        originator: 'Codex Desktop',
        Authorization: 'Bearer access-test',
      },
      body: JSON.stringify({
        credit_id: null,
        redeem_request_id: '00000000-0000-4000-8000-000000000000',
      }),
    });
    expect(result).toEqual({
      status: 200,
      statusText: '',
      body: { consumed: true },
    });
  });

  it('does not request the API when the confirmation is declined', async () => {
    // Arrange
    const ctx = createCommandContext(false);
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

    // Act
    await handleUseResetCreditCommand(ctx, { fetch: fetchMock });

    // Assert
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith('Codex reset credit request cancelled.', 'warning');
  });

  it('notifies success after the reset credit is consumed', async () => {
    // Arrange
    const ctx = createCommandContext(true);
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () => Response.json({ consumed: true }, { status: 200 }));

    // Act
    await handleUseResetCreditCommand(ctx, {
      fetch: fetchMock,
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
    });

    // Assert
    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      'Use Codex reset credit?',
      'This will consume one rare Codex rate-limit reset credit for the active openai-codex account. Continue?'
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Codex reset credit consumed successfully.'),
      'info'
    );
  });

  it('notifies errors without leaking a real token', async () => {
    // Arrange
    const ctx = createCommandContext(true);
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () => new Response('no credit', { status: 429, statusText: 'Too Many Requests' }));

    // Act
    await handleUseResetCreditCommand(ctx, { fetch: fetchMock });

    // Assert
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'Codex reset credit request failed: Reset credit request failed: 429 Too Many Requests',
      'error'
    );
  });
});

describe('count reset credits command', () => {
  it('gets the available reset credit count with the active Codex OAuth token', async () => {
    // Arrange
    const ctx = createContext();
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () => Response.json({ availableCount: 3 }, { status: 200 }));

    // Act
    const result = await countResetCredits(ctx, { fetch: fetchMock });

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://chatgpt.com/wham/rate-limit-reset-credits', {
      method: 'GET',
      headers: {
        'OAI-Language': 'en',
        originator: 'Codex Desktop',
        Authorization: 'Bearer access-test',
      },
    });
    expect(result).toEqual({
      status: 200,
      statusText: '',
      body: { availableCount: 3 },
      availableCount: 3,
    });
  });

  it('notifies the available reset token count', async () => {
    // Arrange
    const ctx = createCommandContext(false);
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () => Response.json({ availableCount: 2 }, { status: 200 }));

    // Act
    await handleResetCreditCountCommand(ctx, { fetch: fetchMock });

    // Assert
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith('You have 2 reset tokens available.', 'info');
  });
});

function createCommandContext(confirmed: boolean): TestCommandContext & ExtensionCommandContext {
  return {
    ...createContext(),
    ui: {
      confirm: vi.fn(async () => confirmed),
      notify: vi.fn(),
    },
  } as unknown as TestCommandContext & ExtensionCommandContext;
}

type TestCommandContext = ReturnType<typeof createContext> & {
  ui: {
    confirm: ReturnType<typeof vi.fn>;
    notify: ReturnType<typeof vi.fn>;
  };
};
