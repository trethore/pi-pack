import type { Api, Context, Model } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';

import { convertResponsesMessages } from '#pi-codexify/features/openai-compaction/responses/openai-responses-conversion.js';

const model = {
  id: 'gpt-5.1',
  provider: 'openai',
  api: 'openai-responses',
  reasoning: true,
  input: ['text'],
} as Model<Api>;

describe('openai responses message conversion', () => {
  it('inserts synthetic tool results for assistant tool calls without results', () => {
    // Arrange
    const context = {
      messages: [
        {
          role: 'assistant',
          provider: model.provider,
          api: model.api,
          model: model.id,
          content: [{ type: 'toolCall', id: 'call_1', name: 'search', arguments: { query: 'hello' } }],
          timestamp: 1,
        },
        { role: 'user', content: 'continue', timestamp: 2 },
      ],
    } as unknown as Context;

    // Act
    const input = convertResponsesMessages(model, context, new Set(['openai']), { includeSystemPrompt: false });

    // Assert
    expect(input.map((item) => item['type'] ?? item['role'])).toEqual([
      'function_call',
      'function_call_output',
      'user',
    ]);
    expect(input[1]).toMatchObject({ type: 'function_call_output', call_id: 'call_1' });
  });
});
