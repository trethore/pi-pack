import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { buildSessionHistory, handleDumpSessionHistoryCommand } from '#pi-handy/features/dump-session-history/index.js';

describe('dump session history command', () => {
  it('dumps the current branch history to the agent directory', async () => {
    // Arrange
    const outputDirectory = path.join(tmpdir(), `pi-handy-session-history-${randomUUID()}`);
    const notify = vi.fn();
    const branch = [createUserMessageEntry('Hello'), createAssistantMessageEntry('Hi there')];

    // Act
    const filePath = await handleDumpSessionHistoryCommand(
      {
        sessionManager: {
          getBranch: () => branch,
          getSessionFile: () => '/tmp/session.jsonl',
          getSessionId: () => 'session-id',
          getCwd: () => '/work/project',
        },
        ui: { notify },
      },
      { now: new Date('2026-06-09T12:34:56.789Z'), outputDirectory }
    );

    // Assert
    if (!filePath) throw new Error('Expected session history file path');
    expect(filePath).toBe(path.join(outputDirectory, '.session-history-2026-06-09T12:34:56.789Z'));
    await expect(readFile(filePath, 'utf8')).resolves.toContain('[User]: Hello\n\n[Assistant]: Hi there');
    expect(notify).toHaveBeenCalledWith(`Session history dumped to ${filePath}`, 'success');
  });

  it('serializes compaction and branch summaries', () => {
    // Arrange
    const branch: SessionEntry[] = [
      {
        type: 'compaction',
        id: 'compaction-id',
        parentId: null,
        timestamp: '2026-06-09T12:00:00.000Z',
        summary: 'Earlier work',
        firstKeptEntryId: 'message-id',
        tokensBefore: 100,
      },
      {
        type: 'branch_summary',
        id: 'branch-summary-id',
        parentId: 'compaction-id',
        timestamp: '2026-06-09T12:01:00.000Z',
        fromId: 'old-branch-id',
        summary: 'Other branch',
      },
    ];

    // Act
    const history = buildSessionHistory(branch);

    // Assert
    expect(history).toContain('Earlier work');
    expect(history).toContain('Other branch');
  });

  it('notifies when there is no message history to dump', async () => {
    // Arrange
    const notify = vi.fn();
    const sessionFile: string | undefined = undefined;

    // Act
    const filePath = await handleDumpSessionHistoryCommand({
      sessionManager: {
        getBranch: () => [],
        getSessionFile: () => sessionFile,
        getSessionId: () => 'session-id',
        getCwd: () => '/work/project',
      },
      ui: { notify },
    });

    // Assert
    expect(filePath).toBeUndefined();
    expect(notify).toHaveBeenCalledWith('No session history to dump', 'warning');
  });
});

function createUserMessageEntry(text: string): SessionEntry {
  return {
    type: 'message',
    id: `user-${randomUUID()}`,
    parentId: null,
    timestamp: '2026-06-09T12:00:00.000Z',
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: Date.parse('2026-06-09T12:00:00.000Z'),
    },
  };
}

function createAssistantMessageEntry(text: string): SessionEntry {
  return {
    type: 'message',
    id: `assistant-${randomUUID()}`,
    parentId: null,
    timestamp: '2026-06-09T12:00:01.000Z',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
      api: 'openai-responses',
      provider: 'openai',
      model: 'gpt-4o-mini',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: Date.parse('2026-06-09T12:00:01.000Z'),
    },
  };
}
