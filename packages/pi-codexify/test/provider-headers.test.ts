import { describe, expect, it } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { defaultConfig, type PiCodexifyConfig } from '#pi-codexify/config/types.js';
import { registerProviderHeaders } from '#pi-codexify/provider-headers.js';

type HeaderHandler = (
  event: { headers: Record<string, string | null> },
  ctx: { model?: { provider: string; id: string; api: string } }
) => void;

describe('provider header mutations', () => {
  it('adds the Codex priority routing hint without replacing existing headers', () => {
    const handler = registerTestHandler(createConfig('priority'));
    const headers = { 'x-existing': 'existing' };

    handler({ headers }, { model: { provider: 'openai-codex', id: 'gpt-5.5', api: 'openai-codex-responses' } });

    expect(headers).toEqual({
      'x-existing': 'existing',
      'x-codex-routing-hint': 'model=gpt-5.5;tier=priority',
    });
  });

  it.each([
    [
      'default tier',
      createConfig('default'),
      { provider: 'openai-codex', id: 'gpt-5.5', api: 'openai-codex-responses' },
    ],
    [
      'disabled controls',
      createConfig('priority', false),
      { provider: 'openai-codex', id: 'gpt-5.5', api: 'openai-codex-responses' },
    ],
    ['non-Codex provider', createConfig('priority'), { provider: 'openai', id: 'gpt-5.5', api: 'openai-responses' }],
  ])('does not add the routing hint for %s', (_scenario, config, model) => {
    const handler = registerTestHandler(config);
    const headers = {};

    handler({ headers }, { model });

    expect(headers).toEqual({});
  });
});

function registerTestHandler(config: PiCodexifyConfig): HeaderHandler {
  let handler: HeaderHandler | undefined;
  const pi = {
    on(eventName: string, registeredHandler: HeaderHandler) {
      if (eventName === 'before_provider_headers') handler = registeredHandler;
    },
  } as unknown as ExtensionAPI;

  registerProviderHeaders(pi, () => config);
  if (!handler) throw new Error('before_provider_headers handler was not registered');
  return handler;
}

function createConfig(serviceTier: 'default' | 'priority', controlsEnabled = true): PiCodexifyConfig {
  return {
    ...defaultConfig,
    controls: {
      ...defaultConfig.controls,
      enabled: controlsEnabled,
      serviceTier,
    },
  };
}
