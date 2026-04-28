import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { PiCutConfig } from '#src/config/schema.js';
import { resolveToolConfig } from '#src/config/tool-config.js';
import { foldRepeatedBlocks } from '#src/features/repeated-block-folding/fold-repeated-blocks.js';
import { transformTextContent } from '#src/shared/content.js';

export function registerRepeatedBlockFolding(pi: ExtensionAPI, config: PiCutConfig) {
  pi.on('tool_result', (event) => {
    const toolConfig = resolveToolConfig(config, event.toolName);
    if (!toolConfig.enabled || !toolConfig.repeatedBlockFolding.enabled) return;

    const content = transformTextContent(event.content, (text) =>
      foldRepeatedBlocks(
        text,
        toolConfig.repeatedBlockFolding.minLines,
        toolConfig.repeatedBlockFolding.minRepeats
      )
    );
    if (content === event.content) return;

    return { content };
  });
}
