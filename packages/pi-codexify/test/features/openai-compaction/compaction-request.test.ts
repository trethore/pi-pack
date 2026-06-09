import type { AgentMessage } from '#pi-codexify/features/openai-compaction/shared/agent-message.js';
import type { Api, Model } from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeCompactEvent,
  SessionEntry,
} from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { buildNativeCompactionRequest } from '#pi-codexify/features/openai-compaction/core/compaction-request.js';
import type { NativeCompactionRuntime } from '#pi-codexify/features/openai-compaction/core/runtime.js';
import {
  NATIVE_COMPACTION_STRATEGY,
  type NativeCompactionEntry,
} from '#pi-codexify/features/openai-compaction/core/types.js';
import type { OpenAICompactionState } from '#pi-codexify/features/openai-compaction/state.js';

const model = {
  id: 'gpt-5.1',
  provider: 'openai',
  api: 'openai-responses',
  baseUrl: 'https://api.openai.com/v1',
  reasoning: false,
  input: ['text'],
} as Model<Api>;

function user(content: string, timestamp = 1): AgentMessage {
  return { role: 'user', content, timestamp } as AgentMessage;
}

function messageEntry(id: string, parentId: string | null, message: AgentMessage): SessionEntry {
  return {
    type: 'message',
    id,
    parentId,
    timestamp: new Date(message.timestamp ?? 1).toISOString(),
    message,
  } as SessionEntry;
}

function nativeCompactionEntry(parentId: string): NativeCompactionEntry {
  return {
    type: 'compaction',
    id: 'compact',
    parentId,
    timestamp: new Date(2).toISOString(),
    summary: '[OpenAI native compaction checkpoint]',
    firstKeptEntryId: parentId,
    tokensBefore: 100,
    details: {
      strategy: NATIVE_COMPACTION_STRATEGY,
      provider: model.provider,
      api: model.api,
      model: 'gpt-5.5',
      baseUrl: model.baseUrl as string,
      createdAt: new Date(3).toISOString(),
      compactedWindow: [{ type: 'compaction_summary', encrypted_content: 'sealed' }],
    },
  } as NativeCompactionEntry;
}

function createContext(): ExtensionContext {
  return {
    model,
    getSystemPrompt: () => 'system prompt',
    sessionManager: { getSessionId: () => 'session-1' },
  } as unknown as ExtensionContext;
}

function createPi(): ExtensionAPI {
  return {
    getActiveTools: () => [],
    getAllTools: () => [],
    getThinkingLevel: () => 'medium',
  } as unknown as ExtensionAPI;
}

function createState(): OpenAICompactionState {
  return { config: { enabled: true, model: 'gpt-5.5', reasoning: 'current' } };
}

function createRuntime(): NativeCompactionRuntime {
  return {
    provider: 'openai',
    api: 'openai-responses',
    model: model.id,
    baseUrl: model.baseUrl as string,
    apiKey: 'test-key',
    compactUrl: 'https://api.openai.com/v1/responses/compact',
    currentModel: model,
  };
}

function createEvent(messagesToSummarize: AgentMessage[]): SessionBeforeCompactEvent {
  return {
    signal: new AbortController().signal,
    preparation: {
      messagesToSummarize,
      turnPrefixMessages: [],
      firstKeptEntryId: 'pre',
      tokensBefore: 100,
    },
  } as unknown as SessionBeforeCompactEvent;
}

function inputItemLabel(item: unknown): string | undefined {
  return (item as { type?: string; role?: string }).type ?? (item as { role?: string }).role;
}

describe('openai native compaction request builder', () => {
  it('reuses the latest native compacted window before the live tail', () => {
    // Arrange
    const pre = messageEntry('pre', null, user('pre', 1));
    const compact = nativeCompactionEntry('pre');
    const tail = messageEntry('tail', 'compact', user('tail', 4));

    // Act
    const result = buildNativeCompactionRequest({
      pi: createPi(),
      ctx: createContext(),
      state: createState(),
      runtime: createRuntime(),
      branchEntries: [pre, compact, tail],
      event: createEvent([user('ignored')]),
    });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.compactedKeptWindow).toBe(false);
    expect(result.request.input.map((item) => inputItemLabel(item))).toEqual(['compaction_summary', 'user']);
  });

  it('falls back to the branch live tail when preparation serializes to an empty input', () => {
    // Arrange
    const pre = messageEntry('pre', null, user('pre', 1));

    // Act
    const result = buildNativeCompactionRequest({
      pi: createPi(),
      ctx: createContext(),
      state: createState(),
      runtime: createRuntime(),
      branchEntries: [pre],
      event: createEvent([]),
    });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.compactedKeptWindow).toBe(true);
    expect(result.request.input).toHaveLength(1);
  });
});
