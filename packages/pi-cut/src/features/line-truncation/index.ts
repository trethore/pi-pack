import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { LineTruncationConfig } from '#src/config/schema.js';
import { transformTextContent } from '#src/shared/content.js';
import { truncateLines } from '#src/features/line-truncation/truncate-lines.js';

export function registerLineTruncation(
  pi: ExtensionAPI,
  piCutEnabled: boolean,
  config: LineTruncationConfig
) {
  pi.on('tool_result', (event) => {
    if (!piCutEnabled || !config.enabled) return;

    const content = transformTextContent(event.content, (text) => truncateLines(text, config.maxChars));
    if (content === event.content) return;

    return { content };
  });
}
