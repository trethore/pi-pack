import type { Api, Model } from '@earendil-works/pi-ai';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { injectPendingNativeWindowIntoPiCompactionRequest } from '#pi-codexify/features/openai-compaction/index.js';
import { serializeMessagesToCompactRequest } from '#pi-codexify/features/openai-compaction/core/serializer.js';
import type { OpenAICompactionState } from '#pi-codexify/features/openai-compaction/state.js';

const model = {
  id: 'gpt-5.1',
  provider: 'openai',
  api: 'openai-responses',
  baseUrl: 'https://api.openai.com/v1',
  reasoning: true,
  input: ['text', 'image'],
} as Model<Api>;

describe('openai compaction serializer', () => {
  it('native compaction requests use OpenAI-compatible compact payload shape', () => {
    // Arrange / Act
    const request = serializeMessagesToCompactRequest({
      model,
      messages: [],
      instructions: 'compact',
    });

    // Assert
    expect(Object.keys(request).sort()).toEqual(['input', 'instructions', 'model']);
  });

  it('injects pending native compacted window into Pi compaction summarization payload', async () => {
    // Arrange
    const ctx = {
      model,
      sessionManager: { getSessionId: () => 'session-1' },
      modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true as const, apiKey: 'key' }) },
    } as unknown as ExtensionContext;
    const state: OpenAICompactionState = {
      config: { enabled: true, model: 'gpt-5.5', reasoning: 'current' },
      pendingPiCompactionNativeWindow: {
        window: [{ type: 'compaction_summary', encrypted_content: 'sealed' }],
        provider: model.provider,
        api: model.api,
        baseUrl: model.baseUrl as string,
        sessionId: 'session-1',
      },
    };
    const payload = {
      model: model.id,
      input: [
        {
          role: 'developer',
          content: 'You are a context summarization assistant. ONLY output the structured summary.',
        },
        { role: 'user', content: [{ type: 'input_text', text: '<conversation>hello</conversation>' }] },
      ],
    };

    // Act
    const rewritten = (await injectPendingNativeWindowIntoPiCompactionRequest(payload, ctx, state)) as typeof payload;

    // Assert
    expect(
      rewritten.input.map((item) => (item as { type?: string; role?: string }).type ?? (item as { role?: string }).role)
    ).toEqual(['developer', 'compaction_summary', 'user']);
    expect(state.pendingPiCompactionNativeWindow).toBeUndefined();
  });
});
