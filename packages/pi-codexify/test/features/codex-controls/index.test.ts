import { describe, expect, it } from 'vitest';

import {
  applyCodexControls,
  buildCodexControlsStatusMessage,
  parseCodexReasoningSummary,
  parseCodexServiceTier,
  parseCodexVerbosity,
} from '#pi-codexify/features/codex-controls/index.js';

describe('codex controls', () => {
  it('parses supported command values and rejects unsupported values', () => {
    expect(parseCodexVerbosity('low')).toBe('low');
    expect(parseCodexVerbosity('off')).toBe('off');
    expect(parseCodexVerbosity('verbose')).toBeUndefined();
    expect(parseCodexReasoningSummary('detailed')).toBe('detailed');
    expect(parseCodexReasoningSummary('none')).toBe('none');
    expect(parseCodexReasoningSummary('off')).toBe('off');
    expect(parseCodexServiceTier('priority')).toBe('priority');
    expect(parseCodexServiceTier('default')).toBe('default');
    expect(parseCodexServiceTier('fast')).toBeUndefined();
  });

  it('patches supported response requests while preserving existing fields', () => {
    const payload = { input: 'hello', text: { format: 'plain' }, reasoning: { effort: 'medium' } };

    const patchedPayload = applyCodexControls(
      payload,
      { enabled: true, verbosity: 'high', reasoningSummary: 'concise', serviceTier: 'priority' },
      { api: 'openai-codex-responses', reasoning: true }
    );

    expect(patchedPayload).toEqual({
      input: 'hello',
      text: { format: 'plain', verbosity: 'high' },
      reasoning: { effort: 'medium', summary: 'concise' },
      service_tier: 'priority',
    });
  });

  it('leaves service tier unchanged when configured as default', () => {
    const payload = { input: 'hello' };

    const patchedPayload = applyCodexControls(
      payload,
      { enabled: true, serviceTier: 'default' },
      { api: 'openai-codex-responses', reasoning: true }
    );

    expect(patchedPayload).toBe(payload);
  });

  it('removes reasoning summary without removing reasoning effort', () => {
    const patchedPayload = applyCodexControls(
      { reasoning: { effort: 'medium', summary: 'auto' } },
      { enabled: true, reasoningSummary: 'none' },
      { api: 'openai-codex-responses', reasoning: true }
    );

    expect(patchedPayload).toEqual({ reasoning: { effort: 'medium' } });
  });

  it('leaves unsupported provider payloads unchanged', () => {
    const payload = { input: 'hello' };

    const patchedPayload = applyCodexControls(
      payload,
      { enabled: true, verbosity: 'high', serviceTier: 'priority' },
      { api: 'anthropic-messages', reasoning: true }
    );

    expect(patchedPayload).toBe(payload);
  });

  it('builds status from the active config and model', () => {
    const message = buildCodexControlsStatusMessage(
      { enabled: true, verbosity: 'high', reasoningSummary: 'detailed', serviceTier: 'priority' },
      {
        provider: 'openai-codex',
        id: 'gpt-5.5',
        api: 'openai-codex-responses',
        reasoning: true,
      }
    );

    expect(message).toContain('verbosity: high');
    expect(message).toContain('reasoning summary: detailed');
    expect(message).toContain('service tier: priority');
  });
});
