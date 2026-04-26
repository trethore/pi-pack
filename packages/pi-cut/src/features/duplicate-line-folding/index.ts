import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { PiCutConfig } from '#src/config/schema.js';
import { resolveToolConfig } from '#src/config/tool-config.js';
import { foldDuplicateLines } from '#src/features/duplicate-line-folding/fold-duplicate-lines.js';
import { transformTextContent } from '#src/shared/content.js';

export function registerDuplicateLineFolding(pi: ExtensionAPI, config: PiCutConfig) {
  pi.on('tool_result', (event) => {
    const toolConfig = resolveToolConfig(config, event.toolName);
    if (!toolConfig.enabled || !toolConfig.duplicateLineFolding.enabled) return;

    const content = transformTextContent(event.content, (text) =>
      foldDuplicateLines(text, toolConfig.duplicateLineFolding.minRepeats)
    );
    if (content === event.content) return;

    return { content };
  });
}
