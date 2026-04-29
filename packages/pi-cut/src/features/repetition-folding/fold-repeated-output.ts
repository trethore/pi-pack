import type { RepetitionFoldingConfig } from '#src/config/schema.js';
import { foldRepeatedBlocks } from '#src/features/repetition-folding/block/fold-repeated-blocks.js';
import { foldDuplicateLines } from '#src/features/repetition-folding/line/fold-duplicate-lines.js';

export function foldRepeatedOutput(text: string, config: RepetitionFoldingConfig): string {
  if (!config.enabled) return text;

  let foldedText = text;

  if (config.block.enabled) {
    foldedText = foldRepeatedBlocks(foldedText, config.block.minLines, config.block.minRepeats);
  }

  if (config.line.enabled) {
    foldedText = foldDuplicateLines(foldedText, config.line.minRepeats);
  }

  return foldedText;
}
