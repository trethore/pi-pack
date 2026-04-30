import type { ContextEvent } from '@mariozechner/pi-coding-agent';

type AgentMessages = ContextEvent['messages'];
type AgentMessage = AgentMessages[number];
type UserMessage = Extract<AgentMessage, { role: 'user' }>;
type UserContentBlock = Extract<UserMessage['content'], unknown[]>[number];
type TextContentBlock = Extract<UserContentBlock, { type: 'text' }>;

export function appendEfficiencyReminderToLatestUserMessage(
  messages: AgentMessages,
  reminderText: string
): AgentMessages {
  const userMessage = findLatestUserMessage(messages);
  if (!userMessage) return messages;

  if (typeof userMessage.content === 'string') {
    userMessage.content = appendReminderToText(userMessage.content, reminderText);
    return messages;
  }

  const textBlock = findLatestTextBlock(userMessage.content);
  if (textBlock) {
    textBlock.text = appendReminderToText(textBlock.text, reminderText);
    return messages;
  }

  userMessage.content.push({ type: 'text', text: reminderText });
  return messages;
}

function findLatestUserMessage(messages: AgentMessages): UserMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user') return message as UserMessage;
  }

  return undefined;
}

function findLatestTextBlock(content: UserContentBlock[]): TextContentBlock | undefined {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const block = content[index];
    if (block.type === 'text') return block as TextContentBlock;
  }

  return undefined;
}

function appendReminderToText(text: string, reminderText: string): string {
  if (hasReminder(text, reminderText)) return text;
  if (text.length === 0) return reminderText;

  return `${text}\n\n${reminderText}`;
}

function hasReminder(text: string, reminderText: string): boolean {
  return text.trimEnd().endsWith(reminderText);
}
