import type { AgentMessage } from '#pi-codexify/features/openai-compaction/shared/agent-message.js';
import type { Api, Model } from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeCompactEvent,
  SessionEntry,
} from '@earendil-works/pi-coding-agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#pi-codexify/features/openai-compaction/core/client.js', () => ({
  executeNativeCompaction: vi.fn(),
}));

import { executeNativeCompaction } from '#pi-codexify/features/openai-compaction/core/client.js';
import { handleOpenAICompactionSessionBeforeCompact } from '#pi-codexify/features/openai-compaction/index.js';
import type { OpenAICompactionState } from '#pi-codexify/features/openai-compaction/state.js';

const model = {
  id: 'gpt-5.1',
  provider: 'openai',
  api: 'openai-responses',
  baseUrl: 'https://api.openai.com/v1',
  reasoning: false,
  input: ['text'],
} as Model<Api>;

function userMessage(content: string): AgentMessage {
  return { role: 'user', content, timestamp: 1 } as AgentMessage;
}

function messageEntry(id: string, message: AgentMessage): SessionEntry {
  return {
    type: 'message',
    id,
    parentId: null,
    timestamp: new Date(message.timestamp ?? 1).toISOString(),
    message,
  } as SessionEntry;
}

function createContext(branchEntries: SessionEntry[]): ExtensionContext {
  return {
    model,
    getSystemPrompt: () => 'compact system',
    sessionManager: {
      getBranch: () => branchEntries,
      getSessionId: () => 'session-1',
    },
    modelRegistry: {
      getApiKeyAndHeaders: async () => ({ ok: true as const, apiKey: 'test-key' }),
    },
    ui: { notify: vi.fn() },
  } as unknown as ExtensionContext;
}

function createPi(): ExtensionAPI {
  return {
    getActiveTools: () => [],
    getAllTools: () => [],
    getThinkingLevel: () => 'medium',
  } as unknown as ExtensionAPI;
}

function createEvent(message: AgentMessage): SessionBeforeCompactEvent {
  return {
    signal: new AbortController().signal,
    preparation: {
      messagesToSummarize: [message],
      turnPrefixMessages: [],
      firstKeptEntryId: 'message-1',
      tokensBefore: 42,
    },
  } as unknown as SessionBeforeCompactEvent;
}

describe('openai compaction handler', () => {
  beforeEach(() => {
    vi.mocked(executeNativeCompaction).mockReset();
  });

  it('simulates native compaction without calling the OpenAI endpoint', async () => {
    // Arrange
    const message = userMessage('hello');
    const ctx = createContext([messageEntry('message-1', message)]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled in tests'));
    vi.mocked(executeNativeCompaction).mockResolvedValue({
      ok: true,
      status: 200,
      compactedWindow: [{ type: 'compaction_summary', encrypted_content: 'sealed' }],
      compactResponseId: 'resp_1',
      createdAt: new Date(2).toISOString(),
      response: { output: [{ type: 'compaction_summary', encrypted_content: 'sealed' }] },
    });
    const state: OpenAICompactionState = {
      config: { enabled: true, model: 'gpt-5.5', reasoning: 'current' },
    };

    // Act
    const result = await handleOpenAICompactionSessionBeforeCompact(createEvent(message), ctx, state, createPi());

    // Assert
    expect(executeNativeCompaction).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ compaction: { details: { compactResponseId: 'resp_1' } } });
    fetchSpy.mockRestore();
  });
});
