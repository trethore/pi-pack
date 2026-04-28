import { splitLineEnding } from '#src/shared/line.js';

export function foldRepeatedBlocks(text: string, minLines: number, minRepeats: number): string {
  const lines = splitLines(text);
  const foldedLines: string[] = [];
  let changed = false;
  let index = 0;

  while (index < lines.length) {
    const repeatedBlock = findRepeatedBlock(lines, index, minLines, minRepeats);

    if (repeatedBlock) {
      const repeatedLineCount = repeatedBlock.lineCount * repeatedBlock.repeatCount;
      const markerEnding = lines[index + repeatedLineCount - 1]?.ending ?? '';

      for (let blockIndex = 0; blockIndex < repeatedBlock.lineCount; blockIndex += 1) {
        foldedLines.push(lines[index + blockIndex].raw);
      }

      foldedLines.push(
        `[previous block of ${repeatedBlock.lineCount} lines repeated x${repeatedBlock.repeatCount - 1}]${markerEnding}`
      );
      changed = true;
      index += repeatedLineCount;
      continue;
    }

    foldedLines.push(lines[index].raw);
    index += 1;
  }

  return changed ? foldedLines.join('') : text;
}

interface LineParts {
  raw: string;
  body: string;
  ending: string;
}

interface RepeatedBlock {
  lineCount: number;
  repeatCount: number;
}

function splitLines(text: string): LineParts[] {
  const lines: LineParts[] = [];

  text.replaceAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g, (raw) => {
    if (raw === '') return raw;

    const { body, ending } = splitLineEnding(raw);
    lines.push({ raw, body, ending });
    return raw;
  });

  return lines;
}

function findRepeatedBlock(
  lines: LineParts[],
  startIndex: number,
  minLines: number,
  minRepeats: number
): RepeatedBlock | undefined {
  const maxLineCount = Math.floor((lines.length - startIndex) / minRepeats);

  for (let lineCount = minLines; lineCount <= maxLineCount; lineCount += 1) {
    if (!isFoldableBlock(lines, startIndex, lineCount)) continue;

    const repeatCount = countBlockRepeats(lines, startIndex, lineCount);
    if (repeatCount >= minRepeats) return { lineCount, repeatCount };
  }

  return undefined;
}

function isFoldableBlock(lines: LineParts[], startIndex: number, lineCount: number): boolean {
  return (
    !isEmptyBlock(lines, startIndex, lineCount) && !isDuplicateLineRun(lines, startIndex, lineCount)
  );
}

function isEmptyBlock(lines: LineParts[], startIndex: number, lineCount: number): boolean {
  for (let index = 0; index < lineCount; index += 1) {
    if (lines[startIndex + index].body.length > 0) return false;
  }

  return true;
}

function isDuplicateLineRun(lines: LineParts[], startIndex: number, lineCount: number): boolean {
  const firstLine = lines[startIndex].body;

  for (let index = 1; index < lineCount; index += 1) {
    if (lines[startIndex + index].body !== firstLine) return false;
  }

  return true;
}

function countBlockRepeats(lines: LineParts[], startIndex: number, lineCount: number): number {
  let repeatCount = 1;

  while (blockEquals(lines, startIndex, startIndex + repeatCount * lineCount, lineCount)) {
    repeatCount += 1;
  }

  return repeatCount;
}

function blockEquals(
  lines: LineParts[],
  leftStartIndex: number,
  rightStartIndex: number,
  lineCount: number
): boolean {
  if (rightStartIndex + lineCount > lines.length) return false;

  for (let index = 0; index < lineCount; index += 1) {
    if (lines[leftStartIndex + index].body !== lines[rightStartIndex + index].body) return false;
  }

  return true;
}
