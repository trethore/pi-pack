const LINE_MARKER_PATTERN = /^\[previous line repeated x\d+\]$/;
const BLOCK_MARKER_PATTERN = /^\[previous block of \d+ lines repeated x\d+\]$/;

export function makeRepetitionMarker(lineCount: number, repeatCount: number): string {
  const foldedRepeatCount = repeatCount - 1;
  if (lineCount === 1) return `[previous line repeated x${foldedRepeatCount}]`;
  return `[previous block of ${lineCount} lines repeated x${foldedRepeatCount}]`;
}

export function isRepetitionMarker(line: string): boolean {
  return LINE_MARKER_PATTERN.test(line) || BLOCK_MARKER_PATTERN.test(line);
}
