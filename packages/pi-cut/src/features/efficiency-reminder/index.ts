import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { PiCutConfig } from '#src/config/schema.js';
import { appendEfficiencyReminderToInputText } from '#src/features/efficiency-reminder/append-efficiency-reminder.js';

export function registerEfficiencyReminder(pi: ExtensionAPI, config: PiCutConfig) {
  let promptCount = 0;

  pi.on('input', (event) => {
    if (!config.enabled || !config.efficiencyReminder.enabled) return;

    promptCount += 1;
    if (promptCount % config.efficiencyReminder.onEvery !== 0) return;

    const text = appendEfficiencyReminderToInputText(event.text, config.efficiencyReminder.text);
    if (text === event.text) return;

    return {
      action: 'transform' as const,
      text,
      images: event.images,
    };
  });
}
