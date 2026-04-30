import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { PiCutConfig } from '#src/config/schema.js';
import { appendEfficiencyReminderToLatestUserMessage } from '#src/features/efficiency-reminder/append-efficiency-reminder.js';

export function registerEfficiencyReminder(pi: ExtensionAPI, config: PiCutConfig) {
  let promptCount = 0;
  let shouldRemindCurrentPrompt = false;

  pi.on('before_agent_start', () => {
    promptCount += 1;
    shouldRemindCurrentPrompt =
      config.enabled &&
      config.efficiencyReminder.enabled &&
      promptCount % config.efficiencyReminder.onEvery === 0;
  });

  pi.on('context', (event) => {
    if (!shouldRemindCurrentPrompt) return;

    return {
      messages: appendEfficiencyReminderToLatestUserMessage(
        event.messages,
        config.efficiencyReminder.text
      ),
    };
  });
}
