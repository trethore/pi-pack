import { describe, expect, it } from 'vitest';

import {
  buildCodexControlsStatusMessage,
  parseCodexReasoningSummary,
  parseCodexVerbosity,
  registerCodexControls,
} from '#pi-codexify/features/codex-controls/index.js';

type Handler = (event: { payload?: unknown }, ctx: { model?: TestModel }) => unknown;
type TestModel = {
  provider: string;
  id: string;
  api: string;
  reasoning?: boolean;
};

describe('codex controls', () => {
  it('parses supported command values and rejects unsupported values', () => {
    expect(parseCodexVerbosity('low')).toBe('low');
    expect(parseCodexVerbosity('off')).toBe('off');
    expect(parseCodexVerbosity('verbose')).toBeUndefined();
    expect(parseCodexReasoningSummary('detailed')).toBe('detailed');
    expect(parseCodexReasoningSummary('off')).toBe('off');
    expect(parseCodexReasoningSummary('long')).toBeUndefined();
  });

  it('patches supported codex response requests with configured verbosity and reasoning summary', () => {
    // Arrange
    const pi = createPi();
    registerCodexControls(pi.extensionApi, {
      enabled: true,
      verbosity: 'high',
      reasoningSummary: 'concise',
    });
    const payload = { input: 'hello', text: { format: 'plain' }, reasoning: { effort: 'medium' } };

    // Act
    const result = pi.emitBeforeProviderRequest(payload, {
      provider: 'openai-codex',
      id: 'gpt-5-codex',
      api: 'openai-codex-responses',
      reasoning: true,
    });

    // Assert
    expect(result).toEqual({
      input: 'hello',
      text: { format: 'plain', verbosity: 'high' },
      reasoning: { effort: 'medium', summary: 'concise' },
    });
    expect(result).not.toBe(payload);
  });

  it('does not add reasoning summary for supported response models without reasoning support', () => {
    // Arrange
    const pi = createPi();
    registerCodexControls(pi.extensionApi, {
      enabled: true,
      verbosity: 'medium',
      reasoningSummary: 'auto',
    });

    // Act
    const result = pi.emitBeforeProviderRequest(
      {},
      { provider: 'openai', id: 'gpt-5', api: 'openai-responses', reasoning: false }
    );

    // Assert
    expect(result).toEqual({ text: { verbosity: 'medium' } });
  });

  it('leaves unsupported provider payloads unchanged', () => {
    // Arrange
    const pi = createPi();
    registerCodexControls(pi.extensionApi, {
      enabled: true,
      verbosity: 'high',
      reasoningSummary: 'detailed',
    });
    const payload = { input: 'hello' };

    // Act
    const result = pi.emitBeforeProviderRequest(payload, {
      provider: 'anthropic',
      id: 'claude',
      api: 'anthropic',
      reasoning: true,
    });

    // Assert
    expect(result).toBeUndefined();
  });

  it('uses controller updates for future request patches and status messages', () => {
    // Arrange
    const pi = createPi();
    const controller = registerCodexControls(pi.extensionApi, { enabled: true });
    controller.updateVerbosity('high');
    controller.updateReasoningSummary('detailed');

    // Act
    const result = pi.emitBeforeProviderRequest(
      {},
      {
        provider: 'openai-codex',
        id: 'gpt-5-codex',
        api: 'openai-codex-responses',
        reasoning: true,
      }
    );
    const status = buildCodexControlsStatusMessage(controller.getConfig(), {
      provider: 'openai-codex',
      id: 'gpt-5-codex',
      api: 'openai-codex-responses',
      reasoning: true,
    });

    // Assert
    expect(result).toEqual({ text: { verbosity: 'high' }, reasoning: { summary: 'detailed' } });
    expect(status).toContain('verbosity: high');
    expect(status).toContain('reasoning summary: detailed');
    expect(status).toContain('verbosity supported here: yes');
    expect(status).toContain('reasoning summary supported here: yes');
  });
});

function createPi() {
  const handlers: Handler[] = [];

  return {
    extensionApi: {
      on(eventName: string, handler: Handler) {
        if (eventName === 'before_provider_request') handlers.push(handler);
      },
    } as unknown as Parameters<typeof registerCodexControls>[0],
    emitBeforeProviderRequest(payload: unknown, model: TestModel) {
      return handlers.at(-1)?.({ payload }, { model });
    },
  };
}
