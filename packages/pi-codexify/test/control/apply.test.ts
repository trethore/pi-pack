import { describe, expect, it } from 'vitest';

import { applyControls } from '#pi-codexify/control/apply.js';
import { buildControlsStatus } from '#pi-codexify/control/status.js';
import { parseReasoningSummary, parseServiceTier, parseVerbosity } from '#pi-codexify/control/values.js';

describe('codex controls', () => {
  it('parses supported command values and rejects unsupported values', () => {
    expect(parseVerbosity('low')).toBe('low');
    expect(parseVerbosity('off')).toBe('off');
    expect(parseVerbosity('verbose')).toBeUndefined();
    expect(parseReasoningSummary('detailed')).toBe('detailed');
    expect(parseReasoningSummary('none')).toBe('none');
    expect(parseReasoningSummary('off')).toBe('off');
    expect(parseServiceTier('priority')).toBe('priority');
    expect(parseServiceTier('default')).toBe('default');
    expect(parseServiceTier('fast')).toBeUndefined();
  });

  it('patches supported response requests while preserving existing fields', () => {
    const payload = { input: 'hello', text: { format: 'plain' }, reasoning: { effort: 'medium' } };

    const patchedPayload = applyControls(
      payload,
      { enabled: true, webSearch: true, verbosity: 'high', reasoningSummary: 'concise', serviceTier: 'priority' },
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

    const patchedPayload = applyControls(
      payload,
      { enabled: true, webSearch: true, serviceTier: 'default' },
      { api: 'openai-codex-responses', reasoning: true }
    );

    expect(patchedPayload).toBe(payload);
  });

  it('removes reasoning summary without removing reasoning effort', () => {
    const patchedPayload = applyControls(
      { reasoning: { effort: 'medium', summary: 'auto' } },
      { enabled: true, webSearch: true, reasoningSummary: 'none' },
      { api: 'openai-codex-responses', reasoning: true }
    );

    expect(patchedPayload).toEqual({ reasoning: { effort: 'medium' } });
  });

  it('leaves unsupported provider payloads unchanged', () => {
    const payload = { input: 'hello' };

    const patchedPayload = applyControls(
      payload,
      { enabled: true, webSearch: true, verbosity: 'high', serviceTier: 'priority' },
      { api: 'anthropic-messages', reasoning: true }
    );

    expect(patchedPayload).toBe(payload);
  });

  it('builds status from the active config and model', () => {
    const message = buildControlsStatus(
      { enabled: true, webSearch: true, verbosity: 'high', reasoningSummary: 'detailed', serviceTier: 'priority' },
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
