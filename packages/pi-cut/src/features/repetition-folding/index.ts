import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { PiCutConfig } from '#src/config/schema.js';
import { resolveToolConfig } from '#src/config/tool-config.js';
import { foldRepeatedOutput } from '#src/features/repetition-folding/fold-repeated-output.js';
import { transformTextContent } from '#src/shared/content.js';

export function registerRepetitionFolding(pi: ExtensionAPI, config: PiCutConfig) {
  pi.on('tool_result', (event) => {
    const toolConfig = resolveToolConfig(config, event.toolName);
    if (!toolConfig.enabled || !toolConfig.repetitionFolding.enabled) return;

    const content = transformTextContent(event.content, (text) =>
      foldRepeatedOutput(text, toolConfig.repetitionFolding)
    );
    if (content === event.content) return;

    return { content };
  });
}
