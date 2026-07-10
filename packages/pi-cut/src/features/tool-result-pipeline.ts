import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { PiCutConfig, ResolvedToolConfig } from '#src/config/schema.js';
import { resolveToolConfig } from '#src/config/tool-config.js';
import { truncateLines } from '#src/features/line-truncation/truncate-lines.js';
import { foldNewLines } from '#src/features/new-lines-folding/fold-new-lines.js';
import { foldRepeatedOutput } from '#src/features/repetition-folding/fold-repeated-output.js';
import { cleanTerminalOutput } from '#src/features/terminal-cleanup/clean-terminal-output.js';
import { transformTextContent } from '#src/shared/content.js';

export function registerToolResultPipeline(pi: ExtensionAPI, config: PiCutConfig) {
  pi.on('tool_result', (event) => {
    const toolConfig = resolveToolConfig(config, event.toolName);
    if (!toolConfig.enabled) return;
    if (event.isError && !toolConfig.transformErrors) return;

    const content = transformTextContent(event.content, (text) => transformToolResultText(text, toolConfig));
    if (content === event.content) return;

    return { content };
  });
}

function transformToolResultText(text: string, config: ResolvedToolConfig): string {
  let transformedText = text;
  transformedText = transformTerminalOutput(transformedText, config);
  transformedText = transformRepetitions(transformedText, config);
  transformedText = transformNewLines(transformedText, config);
  transformedText = transformLongLines(transformedText, config);
  return transformedText;
}

function transformTerminalOutput(text: string, config: ResolvedToolConfig): string {
  return config.terminalCleanup.enabled ? cleanTerminalOutput(text, config.terminalCleanup) : text;
}

function transformNewLines(text: string, config: ResolvedToolConfig): string {
  return config.newLinesFolding.enabled ? foldNewLines(text, config.newLinesFolding) : text;
}

function transformRepetitions(text: string, config: ResolvedToolConfig): string {
  return config.repetitionFolding.enabled ? foldRepeatedOutput(text, config.repetitionFolding) : text;
}

function transformLongLines(text: string, config: ResolvedToolConfig): string {
  return config.lineTruncation.enabled ? truncateLines(text, config.lineTruncation.maxChars) : text;
}
