import type { RepetitionFoldingConfig } from '#src/config/schema.js';
import { foldRepeatedBlocks } from '#src/features/repetition-folding/block/fold-repeated-blocks.js';
import { foldDuplicateLines } from '#src/features/repetition-folding/line/fold-duplicate-lines.js';

export const MAX_FOLDING_LINES = 10_000;

export function foldRepeatedOutput(text: string, config: RepetitionFoldingConfig): string {
  if (!config.enabled || (!config.block.enabled && !config.line.enabled)) return text;
  if (exceedsMaxFoldingLines(text)) return text;

  let foldedText = text;

  if (config.block.enabled) {
    foldedText = foldRepeatedBlocks(foldedText, config.block.minLines, config.block.minRepeats);
  }

  if (config.line.enabled) {
    foldedText = foldDuplicateLines(foldedText, config.line.minRepeats);
  }

  return foldedText;
}

function exceedsMaxFoldingLines(text: string): boolean {
  let lineCount = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character !== '\r' && character !== '\n') continue;

    lineCount += 1;
    if (lineCount > MAX_FOLDING_LINES) return true;

    if (character === '\r' && text[index + 1] === '\n') index += 1;
  }

  const hasTrailingLine = text.length > 0 && !text.endsWith('\r') && !text.endsWith('\n');
  return hasTrailingLine && lineCount + 1 > MAX_FOLDING_LINES;
}
