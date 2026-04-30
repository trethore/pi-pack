import { describe, expect, it } from 'vitest';
import type { ContextEvent } from '@mariozechner/pi-coding-agent';
import { appendEfficiencyReminderToLatestUserMessage } from '#pi-cut/features/efficiency-reminder/append-efficiency-reminder.js';

const REMINDER = '<system_reminder>Keep output concise.</system_reminder>';

describe('appendEfficiencyReminderToLatestUserMessage', () => {
  it('appends the reminder to string user content', () => {
    // Arrange
    const messages = makeMessages([{ role: 'user', content: 'Do the task', timestamp: 1 }]);

    // Act
    const updatedMessages = appendEfficiencyReminderToLatestUserMessage(messages, REMINDER);

    // Assert
    expect(updatedMessages[0]).toMatchObject({
      role: 'user',
      content: `Do the task\n\n${REMINDER}`,
    });
  });

  it('appends the reminder to the latest text block in user content', () => {
    // Arrange
    const messages = makeMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Do the task' },
          { type: 'image', data: 'abc', mimeType: 'image/png' },
        ],
        timestamp: 1,
      },
    ]);

    // Act
    appendEfficiencyReminderToLatestUserMessage(messages, REMINDER);

    // Assert
    expect(messages[0]).toMatchObject({
      content: [
        { type: 'text', text: `Do the task\n\n${REMINDER}` },
        { type: 'image', data: 'abc', mimeType: 'image/png' },
      ],
    });
  });

  it('adds a text block to image-only user content', () => {
    // Arrange
    const messages = makeMessages([
      {
        role: 'user',
        content: [{ type: 'image', data: 'abc', mimeType: 'image/png' }],
        timestamp: 1,
      },
    ]);

    // Act
    appendEfficiencyReminderToLatestUserMessage(messages, REMINDER);

    // Assert
    expect(messages[0]).toMatchObject({
      content: [
        { type: 'image', data: 'abc', mimeType: 'image/png' },
        { type: 'text', text: REMINDER },
      ],
    });
  });

  it('updates only the latest user message', () => {
    // Arrange
    const messages = makeMessages([
      { role: 'user', content: 'First prompt', timestamp: 1 },
      {
        role: 'assistant',
        content: [],
        api: 'openai-completions',
        provider: 'openai',
        model: 'test',
        usage: makeUsage(),
        stopReason: 'stop',
        timestamp: 2,
      },
      { role: 'user', content: 'Second prompt', timestamp: 3 },
    ]);

    // Act
    appendEfficiencyReminderToLatestUserMessage(messages, REMINDER);

    // Assert
    expect(messages[0]).toMatchObject({ content: 'First prompt' });
    expect(messages[2]).toMatchObject({ content: `Second prompt\n\n${REMINDER}` });
  });

  it('does not append duplicate reminders', () => {
    // Arrange
    const messages = makeMessages([
      { role: 'user', content: `Do the task\n\n${REMINDER}`, timestamp: 1 },
    ]);

    // Act
    appendEfficiencyReminderToLatestUserMessage(messages, REMINDER);

    // Assert
    expect(messages[0]).toMatchObject({ content: `Do the task\n\n${REMINDER}` });
  });
});

function makeMessages(messages: ContextEvent['messages']): ContextEvent['messages'] {
  return messages;
}

function makeUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}
