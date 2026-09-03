import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { defaultMessages } from '#src/config/messages.js';
import type { PiWhimsicalConfig } from '#src/config/schema.js';

export function registerWorkingMessage(pi: ExtensionAPI, config: PiWhimsicalConfig): void {
  if (!config.enabled) return;

  pi.on('turn_start', (_event, ctx) => {
    ctx.ui.setWorkingMessage(pickRandom(config.messages));
  });

  pi.on('turn_end', (_event, ctx) => {
    ctx.ui.setWorkingMessage();
  });
}

export function pickRandom(messages: readonly string[], random: () => number = Math.random): string {
  const index = Math.floor(random() * messages.length);
  return messages[index] ?? defaultMessages[0];
}
