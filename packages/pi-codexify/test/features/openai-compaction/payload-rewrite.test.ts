import type { AgentMessage } from '#pi-codexify/features/openai-compaction/shared/agent-message.js';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { buildNativeReplaySegments } from '#pi-codexify/features/openai-compaction/replay/replay.js';
import { serializeMessagesToResponsesInput } from '#pi-codexify/features/openai-compaction/core/serializer.js';
import {
  NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE,
  NATIVE_COMPACTION_STRATEGY,
  type NativeCompactionEntry,
} from '#pi-codexify/features/openai-compaction/core/types.js';

const model = {
  id: 'gpt-5.1',
  provider: 'openai',
  api: 'openai-responses',
  reasoning: true,
  input: ['text'],
} as Model<Api>;

function user(text: string, timestamp = 1): AgentMessage {
  return { role: 'user', content: text, timestamp } as AgentMessage;
}

function custom(customType: string, content: string, timestamp = 1): AgentMessage {
  return { role: 'custom', customType, content, display: true, timestamp } as AgentMessage;
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

function customMessageEntry(id: string, parentId: string | null, message: AgentMessage): SessionEntry {
  return {
    type: 'custom_message',
    id,
    parentId,
    timestamp: new Date(message.timestamp ?? 1).toISOString(),
    customType: (message as { customType: string }).customType,
    content: (message as { content: string }).content,
    display: true,
    details: undefined,
  } as SessionEntry;
}

function compactionEntry(parentId: string): NativeCompactionEntry {
  return {
    type: 'compaction',
    id: 'compact',
    parentId,
    timestamp: new Date(3).toISOString(),
    summary: '[OpenAI native compaction checkpoint]',
    firstKeptEntryId: 'pre',
    tokensBefore: 100,
    details: {
      strategy: NATIVE_COMPACTION_STRATEGY,
      provider: 'openai',
      api: 'openai-responses',
      model: 'gpt-5.1',
      baseUrl: 'https://api.openai.com/v1',
      createdAt: new Date(4).toISOString(),
      compactedWindow: [{ type: 'compaction_summary', encrypted_content: 'sealed' }],
    },
  } as NativeCompactionEntry;
}

function compactionSummaryMessage(entry: NativeCompactionEntry): AgentMessage {
  return {
    role: 'compactionSummary',
    summary: entry.summary,
    tokensBefore: entry.tokensBefore,
    timestamp: new Date(entry.timestamp).getTime(),
  } as AgentMessage;
}

function piCompactionEntry(id: string, parentId: string): SessionEntry {
  return {
    type: 'compaction',
    id,
    parentId,
    timestamp: new Date(8).toISOString(),
    summary: 'Pi fallback summary',
    firstKeptEntryId: parentId,
    tokensBefore: 200,
  } as SessionEntry;
}

function runReplay(payloadMessages: AgentMessage[]) {
  const pre = messageEntry('pre', null, user('pre', 1));
  const compaction = compactionEntry('pre');
  const display = customMessageEntry(
    'display',
    'compact',
    custom(NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE, 'display', 5)
  );
  const tail = messageEntry('tail', 'display', user('tail', 6));
  return buildNativeReplaySegments({
    model,
    payload: { model: model.id, input: serializeMessagesToResponsesInput(model, payloadMessages), instructions: '' },
    branchEntries: [pre, compaction, display, tail],
    compactionEntry: compaction,
  });
}

function inputRoles(input: readonly unknown[]): string[] {
  return input.map(
    (item) => (item as { type?: string; role?: string }).type ?? (item as { role?: string }).role ?? 'unknown'
  );
}

describe('openai compaction payload rewrite', () => {
  it('native replay accepts Pi payloads that include adapter display messages', () => {
    // Arrange
    const compaction = compactionEntry('pre');

    // Act
    const result = runReplay([
      compactionSummaryMessage(compaction),
      user('pre', 1),
      custom(NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE, 'display', 5),
      user('tail', 6),
    ]);

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(inputRoles(result.rewrittenPayload.input)).toEqual(['compaction_summary', 'user']);
  });

  it('native replay preserves current payload tail beyond persisted branch entries', () => {
    // Arrange
    const compaction = compactionEntry('pre');

    // Act
    const result = runReplay([
      compactionSummaryMessage(compaction),
      user('pre', 1),
      user('tail', 6),
      user('current', 7),
    ]);

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(inputRoles(result.rewrittenPayload.input)).toEqual(['compaction_summary', 'user', 'user']);
  });

  it('native replay preserves the previous native blob across a newer Pi fallback compaction', () => {
    // Arrange
    const pre = messageEntry('pre', null, user('pre', 1));
    const nativeCompaction = compactionEntry('pre');
    const fallbackTail = messageEntry('fallback-tail', 'compact', user('fallback tail', 6));
    const piFallback = piCompactionEntry('pi-compact', 'fallback-tail');
    const currentTail = messageEntry('current-tail', 'pi-compact', user('current tail', 9));

    // Act
    const result = buildNativeReplaySegments({
      model,
      payload: {
        model: model.id,
        input: serializeMessagesToResponsesInput(model, [
          {
            role: 'compactionSummary',
            summary: 'Pi fallback summary',
            tokensBefore: 200,
            timestamp: 8,
          } as AgentMessage,
          user('current tail', 9),
        ]),
        instructions: '',
      },
      branchEntries: [pre, nativeCompaction, fallbackTail, piFallback, currentTail],
      compactionEntry: nativeCompaction,
    });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(inputRoles(result.rewrittenPayload.input)).toEqual(['compaction_summary', 'user', 'user']);
    expect((result.rewrittenPayload.input[0] as { encrypted_content?: string }).encrypted_content).toBe('sealed');
  });
});
