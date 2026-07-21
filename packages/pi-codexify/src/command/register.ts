import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { PiCodexifyConfig } from '#src/config/types.js';
import { getCompletions } from '#src/command/completions.js';
import { handleCommand } from '#src/command/handler.js';

export function registerCommand(pi: ExtensionAPI, config: PiCodexifyConfig): void {
  pi.registerCommand('codexify', {
    description: 'Control Codex payload options and inspect Codex usage',
    getArgumentCompletions: (prefix) => getCompletions(prefix, config),
    handler: async (args, ctx) => {
      await handleCommand(args, ctx, config);
    },
  });
}
