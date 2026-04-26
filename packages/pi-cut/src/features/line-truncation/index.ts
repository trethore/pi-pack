import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { PiCutConfig } from '#src/config/schema.js';
import { resolveToolConfig } from '#src/config/tool-config.js';
import { transformTextContent } from '#src/shared/content.js';
import { truncateLines } from '#src/features/line-truncation/truncate-lines.js';

export function registerLineTruncation(pi: ExtensionAPI, config: PiCutConfig) {
  pi.on('tool_result', (event) => {
    const toolConfig = resolveToolConfig(config, event.toolName);
    if (!toolConfig.enabled || !toolConfig.lineTruncation.enabled) return;

    const content = transformTextContent(event.content, (text) =>
      truncateLines(text, toolConfig.lineTruncation.maxChars)
    );
    if (content === event.content) return;

    return { content };
  });
}
