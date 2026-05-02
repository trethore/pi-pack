export function appendEfficiencyReminderToInputText(text: string, reminderText: string): string {
  if (hasReminder(text, reminderText)) return text;
  if (text.length === 0) return reminderText;

  return `${text}\n\n${reminderText}`;
}

function hasReminder(text: string, reminderText: string): boolean {
  return text.trimEnd().endsWith(reminderText);
}
