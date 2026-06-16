import { describe, expect, it } from 'vitest';

import {
  buildCodexControlsStatusMessage,
  parseCodexReasoningSummary,
  parseCodexServiceTier,
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
    // Act and assert
    expect(parseCodexVerbosity('low')).toBe('low');
    expect(parseCodexVerbosity('off')).toBe('off');
    expect(parseCodexVerbosity('verbose')).toBeUndefined();
    expect(parseCodexReasoningSummary('detailed')).toBe('detailed');
    expect(parseCodexReasoningSummary('off')).toBe('off');
    expect(parseCodexReasoningSummary('long')).toBeUndefined();
    expect(parseCodexServiceTier('fast')).toBe('fast');
    expect(parseCodexServiceTier('slow')).toBe('slow');
    expect(parseCodexServiceTier('priority')).toBeUndefined();
  });

  it('patches supported codex response requests with configured verbosity, reasoning summary, and service tier', () => {
    // Arrange
    const pi = createPi();
    registerCodexControls(pi.extensionApi, {
      enabled: true,
      verbosity: 'high',
      reasoningSummary: 'concise',
      serviceTier: 'fast',
    });
    const payload = { input: 'hello', text: { format: 'plain' }, reasoning: { effort: 'medium' } };

    // Act
    const patchedPayload = pi.emitBeforeProviderRequest(payload, {
      provider: 'openai-codex',
      id: 'gpt-5-codex',
      api: 'openai-codex-responses',
      reasoning: true,
    });

    // Assert
    expect(patchedPayload).toEqual({
      input: 'hello',
      text: { format: 'plain', verbosity: 'high' },
      reasoning: { effort: 'medium', summary: 'concise' },
      service_tier: 'priority',
    });
    expect(patchedPayload).not.toBe(payload);
  });

  it('does not add service_tier for slow service tier', () => {
    // Arrange
    const pi = createPi();
    registerCodexControls(pi.extensionApi, {
      enabled: true,
      serviceTier: 'slow',
    });
    const payload = { input: 'hello' };

    // Act
    const patchedPayload = pi.emitBeforeProviderRequest(payload, {
      provider: 'openai-codex',
      id: 'gpt-5-codex',
      api: 'openai-codex-responses',
      reasoning: true,
    });

    // Assert
    expect(patchedPayload).toBe(payload);
  });

  it.each([
    ['openai-responses', 'openai'],
    ['openai-codex-responses', 'openai-codex'],
    ['azure-openai-responses', 'azure-openai-responses'],
  ])('adds service_tier for supported %s payloads', (api, provider) => {
    // Arrange
    const pi = createPi();
    registerCodexControls(pi.extensionApi, {
      enabled: true,
      serviceTier: 'fast',
    });

    // Act
    const patchedPayload = pi.emitBeforeProviderRequest({}, { provider, id: 'gpt-5', api });

    // Assert
    expect(patchedPayload).toEqual({ service_tier: 'priority' });
  });

  it('does not add reasoning summary for supported response models without reasoning support', () => {
    // Arrange
    const pi = createPi();
    registerCodexControls(pi.extensionApi, {
      enabled: true,
      verbosity: 'medium',
      reasoningSummary: 'auto',
      serviceTier: 'fast',
    });

    // Act
    const patchedPayload = pi.emitBeforeProviderRequest(
      {},
      { provider: 'openai', id: 'gpt-5', api: 'openai-responses', reasoning: false }
    );

    // Assert
    expect(patchedPayload).toEqual({ text: { verbosity: 'medium' }, service_tier: 'priority' });
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
    const unchangedPayload = pi.emitBeforeProviderRequest(payload, {
      provider: 'anthropic',
      id: 'claude',
      api: 'anthropic',
      reasoning: true,
    });

    // Assert
    expect(unchangedPayload).toBeUndefined();
  });

  it('uses controller updates for future request patches and status messages', () => {
    // Arrange
    const pi = createPi();
    const controller = registerCodexControls(pi.extensionApi, { enabled: true });
    controller.updateVerbosity('high');
    controller.updateReasoningSummary('detailed');
    controller.updateServiceTier('fast');

    // Act
    const patchedPayload = pi.emitBeforeProviderRequest(
      {},
      {
        provider: 'openai-codex',
        id: 'gpt-5-codex',
        api: 'openai-codex-responses',
        reasoning: true,
      }
    );
    const statusMessage = buildCodexControlsStatusMessage(controller.getConfig(), {
      provider: 'openai-codex',
      id: 'gpt-5-codex',
      api: 'openai-codex-responses',
      reasoning: true,
    });

    // Assert
    expect(patchedPayload).toEqual({
      text: { verbosity: 'high' },
      reasoning: { summary: 'detailed' },
      service_tier: 'priority',
    });
    expect(statusMessage).toContain('verbosity: high');
    expect(statusMessage).toContain('reasoning summary: detailed');
    expect(statusMessage).toContain('service tier: fast');
    expect(statusMessage).toContain('verbosity supported here: yes');
    expect(statusMessage).toContain('reasoning summary supported here: yes');
    expect(statusMessage).toContain('service tier supported here: yes');
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
