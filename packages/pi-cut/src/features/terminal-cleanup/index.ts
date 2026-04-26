import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { PiCutConfig } from '#src/config/schema.js';
import { resolveToolConfig } from '#src/config/tool-config.js';
import { cleanTerminalOutput } from '#src/features/terminal-cleanup/clean-terminal-output.js';
import { transformTextContent } from '#src/shared/content.js';

export function registerTerminalCleanup(pi: ExtensionAPI, config: PiCutConfig) {
  pi.on('tool_result', (event) => {
    const toolConfig = resolveToolConfig(config, event.toolName);
    if (!toolConfig.enabled || !toolConfig.terminalCleanup.enabled) return;

    const content = transformTextContent(event.content, (text) =>
      cleanTerminalOutput(text, {
        stripAnsi: toolConfig.terminalCleanup.stripAnsi,
        collapseCarriageReturns: toolConfig.terminalCleanup.collapseCarriageReturns,
      })
    );
    if (content === event.content) return;

    return { content };
  });
}
