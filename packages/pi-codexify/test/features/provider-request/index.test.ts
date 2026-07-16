import { describe, expect, it } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { defaultConfig } from '#pi-codexify/config/schema.js';
import { registerProviderRequestMutations } from '#pi-codexify/features/provider-request/index.js';

describe('provider request mutations', () => {
  it('registers one hook for controls and web search', () => {
    let handler: ((event: { payload: unknown }, ctx: { model?: unknown }) => unknown) | undefined;
    const registeredEvents: string[] = [];
    const pi = {
      on(eventName: string, registeredHandler: typeof handler) {
        registeredEvents.push(eventName);
        handler = registeredHandler;
      },
    } as unknown as ExtensionAPI;
    const config = {
      ...defaultConfig,
      codex: { enabled: true, verbosity: 'high' as const, serviceTier: 'priority' as const },
    };
    registerProviderRequestMutations(pi, () => config);

    const payload = handler?.(
      { payload: { tools: [] } },
      {
        model: {
          provider: 'openai-codex',
          id: 'gpt-5.5',
          api: 'openai-codex-responses',
          reasoning: true,
        },
      }
    );

    expect(registeredEvents).toEqual(['before_provider_request']);
    expect(payload).toEqual({
      text: { verbosity: 'high' },
      service_tier: 'priority',
      tools: [{ type: 'web_search', external_web_access: true, search_content_types: ['text', 'image'] }],
    });
  });

  it('does not mutate requests when the extension is disabled', () => {
    let handler: ((event: { payload: unknown }, ctx: { model?: unknown }) => unknown) | undefined;
    const pi = {
      on(_eventName: string, registeredHandler: typeof handler) {
        handler = registeredHandler;
      },
    } as unknown as ExtensionAPI;
    registerProviderRequestMutations(pi, () => ({ ...defaultConfig, enabled: false }));

    const result = handler?.({ payload: {} }, { model: undefined });

    expect(result).toBeUndefined();
  });
});
