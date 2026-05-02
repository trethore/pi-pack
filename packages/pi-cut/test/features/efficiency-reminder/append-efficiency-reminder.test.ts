import { describe, expect, it } from 'vitest';
import { appendEfficiencyReminderToInputText } from '#pi-cut/features/efficiency-reminder/append-efficiency-reminder.js';

const REMINDER = '<system_reminder>Keep output concise.</system_reminder>';

describe('appendEfficiencyReminderToInputText', () => {
  it('appends the reminder to input text', () => {
    expect(appendEfficiencyReminderToInputText('Do the task', REMINDER)).toBe(
      `Do the task\n\n${REMINDER}`
    );
  });

  it('uses the reminder as the full text for empty input', () => {
    expect(appendEfficiencyReminderToInputText('', REMINDER)).toBe(REMINDER);
  });

  it('does not append duplicate reminders', () => {
    expect(appendEfficiencyReminderToInputText(`Do the task\n\n${REMINDER}`, REMINDER)).toBe(
      `Do the task\n\n${REMINDER}`
    );
  });
});
