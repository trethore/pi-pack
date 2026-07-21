import type { NewLinesFoldingConfig } from '#src/config/schema.js';

const NEW_LINES_PATTERN = /(?:\r\n|\r|\n){2,}/g;
const SINGLE_NEW_LINE_PATTERN = /\r\n|\r|\n/g;

export function foldNewLines(text: string, config: NewLinesFoldingConfig): string {
  if (!config.enabled) return text;

  return text.replaceAll(NEW_LINES_PATTERN, (newLines) => {
    const newLineMatches = newLines.match(SINGLE_NEW_LINE_PATTERN);
    const firstNewLine = newLineMatches?.[0] ?? '\n';
    const newLinesCount = newLineMatches?.length ?? 0;

    if (newLinesCount < config.minNewLines) return newLines;

    return firstNewLine.repeat(config.foldTo);
  });
}
