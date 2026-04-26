import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { TerminalCleanupConfig } from '#src/config/schema.js';
import { cleanTerminalOutput } from '#src/features/terminal-cleanup/clean-terminal-output.js';
import { transformTextContent } from '#src/shared/content.js';

export function registerTerminalCleanup(
  pi: ExtensionAPI,
  piCutEnabled: boolean,
  config: TerminalCleanupConfig
) {
  pi.on('tool_result', (event) => {
    if (!piCutEnabled || !config.enabled || event.toolName !== 'bash') return;

    const content = transformTextContent(event.content, (text) =>
      cleanTerminalOutput(text, {
        stripAnsi: config.stripAnsi,
        collapseCarriageReturns: config.collapseCarriageReturns,
      })
    );
    if (content === event.content) return;

    return { content };
  });
}
