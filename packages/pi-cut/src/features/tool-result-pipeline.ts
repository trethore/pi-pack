import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { PiCutConfig, ResolvedToolConfig } from '#src/config/schema.js';
import { resolveToolConfig } from '#src/config/tool-config.js';
import { truncateLines } from '#src/features/line-truncation/truncate-lines.js';
import { foldRepeatedOutput } from '#src/features/repetition-folding/fold-repeated-output.js';
import { cleanTerminalOutput } from '#src/features/terminal-cleanup/clean-terminal-output.js';
import { transformTextContent } from '#src/shared/content.js';

export function registerToolResultPipeline(pi: ExtensionAPI, config: PiCutConfig) {
  pi.on('tool_result', (event) => {
    const toolConfig = resolveToolConfig(config, event.toolName);
    if (!toolConfig.enabled) return;

    const content = transformTextContent(event.content, (text) =>
      transformToolResultText(text, toolConfig)
    );
    if (content === event.content) return;

    return { content };
  });
}

function transformToolResultText(text: string, config: ResolvedToolConfig): string {
  let transformedText = text;

  if (config.terminalCleanup.enabled) {
    transformedText = cleanTerminalOutput(transformedText, config.terminalCleanup);
  }

  if (config.repetitionFolding.enabled) {
    transformedText = foldRepeatedOutput(transformedText, config.repetitionFolding);
  }

  if (config.lineTruncation.enabled) {
    transformedText = truncateLines(transformedText, config.lineTruncation.maxChars);
  }

  return transformedText;
}
