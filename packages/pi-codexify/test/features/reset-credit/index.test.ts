import { describe, expect, it, vi } from 'vitest';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

import {
  buildResetCreditDetailsMessage,
  consumeResetCredit,
  countResetCredits,
  getResetCreditDetails,
  handleResetCreditCountCommand,
  handleResetCreditDetailsCommand,
  handleUseResetCreditCommand,
} from '#pi-codexify/features/reset-credit/index.js';
import {
  CODEX_PROVIDER,
  createContext,
  createCredential,
  setCodexCredential,
} from '#test/utils/account-test-helpers.js';

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
    expect(fetchMock).toHaveBeenCalledWith('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume', {
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
    const fetchMock = vi.fn(async () => Response.json({ available_count: 3 }, { status: 200 }));

    // Act
    const result = await countResetCredits(ctx, { fetch: fetchMock });

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits', {
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
      body: { available_count: 3 },
      availableCount: 3,
    });
  });

  it('supports the legacy camelCase available count field', async () => {
    // Arrange
    const ctx = createContext();
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () => Response.json({ availableCount: 3 }, { status: 200 }));

    // Act
    const result = await countResetCredits(ctx, { fetch: fetchMock });

    // Assert
    expect(result.availableCount).toBe(3);
  });

  it('refreshes an expired Codex OAuth token before matching the curl-style count request', async () => {
    // Arrange
    let credential = { ...createCredential('stale'), expires: 1 };
    const ctx = {
      modelRegistry: {
        authStorage: {
          reload: vi.fn(),
          get: vi.fn((provider: string) => (provider === CODEX_PROVIDER ? credential : undefined)),
          getApiKey: vi.fn(async () => {
            credential = createCredential('fresh');
            return credential.access;
          }),
        },
      },
    };
    const fetchMock = vi.fn(async () => Response.json({ availableCount: 1 }, { status: 200 }));

    // Act
    const result = await countResetCredits(ctx, { fetch: fetchMock });

    // Assert
    expect(ctx.modelRegistry.authStorage.getApiKey).toHaveBeenCalledWith(CODEX_PROVIDER, { includeFallback: false });
    expect(fetchMock).toHaveBeenCalledWith('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits', {
      method: 'GET',
      headers: {
        'OAI-Language': 'en',
        originator: 'Codex Desktop',
        Authorization: 'Bearer access-fresh',
      },
    });
    expect(result.availableCount).toBe(1);
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

describe('reset credit details command', () => {
  it('gets reset credit details with the active Codex OAuth token', async () => {
    // Arrange
    const ctx = createContext();
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          available_count: 1,
          credits: [
            {
              id: 'RateLimitResetCredit_1234567890',
              status: 'available',
              expires_at: '2026-07-12T15:30:00.000Z',
            },
            {
              id: 'RateLimitResetCredit_used',
              status: 'redeemed',
              expires_at: '2026-07-10T08:00:00.000Z',
              redeemed_at: '2026-07-04T08:00:00.000Z',
            },
          ],
        },
        { status: 200 }
      )
    );

    // Act
    const result = await getResetCreditDetails(ctx, { fetch: fetchMock });

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits', {
      method: 'GET',
      headers: {
        'OAI-Language': 'en',
        originator: 'Codex Desktop',
        Authorization: 'Bearer access-test',
      },
    });
    expect(result.credits).toEqual([
      {
        id: 'RateLimitResetCredit_1234567890',
        used: false,
        expiresAt: '2026-07-12T15:30:00.000Z',
      },
      {
        id: 'RateLimitResetCredit_used',
        used: true,
        expiresAt: '2026-07-10T08:00:00.000Z',
      },
    ]);
  });

  it('builds a markdown table with shortened ids and ISO expiration dates', () => {
    // Arrange / Act
    const message = buildResetCreditDetailsMessage({
      availableCount: 1,
      credits: [
        {
          id: 'RateLimitResetCredit_1234567890',
          used: false,
          expiresAt: '2026-07-12T15:30:00.000Z',
        },
        {
          id: 'short-id',
          used: true,
        },
      ],
    });

    // Assert
    expect(message).toBe(
      [
        'Codex reset credits',
        'Available reset tokens: 1',
        '',
        '| ID | Used | Expires |',
        '| --- | --- | --- |',
        '| RateLimitResetCr...7890 | no | 2026-07-12T15:30:00.000Z |',
        '| short-id | yes | unknown |',
      ].join('\n')
    );
  });

  it('reports when reset credit details are unavailable', () => {
    // Arrange / Act
    const message = buildResetCreditDetailsMessage({ availableCount: 0, credits: [] });

    // Assert
    expect(message).toBe('No Codex reset credit details available.\nAvailable reset tokens: 0');
  });

  it('notifies reset credit details without confirmation', async () => {
    // Arrange
    const ctx = createCommandContext(false);
    setCodexCredential(ctx, 'test');
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          availableCount: 1,
          credits: [{ id: 'RateLimitResetCredit_1234567890', status: 'available' }],
        },
        { status: 200 }
      )
    );

    // Act
    await handleResetCreditDetailsCommand(ctx, { fetch: fetchMock });

    // Assert
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('| RateLimitResetCr...7890 | no | unknown |'),
      'info'
    );
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
