import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { DuplicateLineFoldingConfig } from '#src/config/schema.js';
import { foldDuplicateLines } from '#src/features/duplicate-line-folding/fold-duplicate-lines.js';
import { transformTextContent } from '#src/shared/content.js';

export function registerDuplicateLineFolding(
  pi: ExtensionAPI,
  piCutEnabled: boolean,
  config: DuplicateLineFoldingConfig
) {
  pi.on('tool_result', (event) => {
    if (!piCutEnabled || !config.enabled) return;

    const content = transformTextContent(event.content, (text) =>
      foldDuplicateLines(text, config.minRepeats)
    );
    if (content === event.content) return;

    return { content };
  });
}
