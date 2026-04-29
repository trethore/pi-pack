import { splitLineEnding } from '#src/shared/line.js';

export function foldDuplicateLines(text: string, minRepeats: number): string {
  const lines = splitLines(text);
  const foldedLines: string[] = [];
  let changed = false;
  let index = 0;

  while (index < lines.length) {
    const current = lines[index];
    const runLength = countDuplicateRun(lines, index);

    if (shouldFoldRun(current.body, runLength, minRepeats)) {
      foldedLines.push(current.raw, `[previous line repeated x${runLength - 1}]${current.ending}`);
      changed = true;
      index += runLength;
      continue;
    }

    for (let runIndex = 0; runIndex < runLength; runIndex += 1) {
      foldedLines.push(lines[index + runIndex].raw);
    }
    index += runLength;
  }

  return changed ? foldedLines.join('') : text;
}

interface LineParts {
  raw: string;
  body: string;
  ending: string;
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

function countDuplicateRun(lines: LineParts[], startIndex: number): number {
  const first = lines[startIndex];
  let length = 1;

  while (startIndex + length < lines.length && lines[startIndex + length].raw === first.raw) {
    length += 1;
  }

  return length;
}

function shouldFoldRun(line: string, runLength: number, minRepeats: number): boolean {
  return line.length > 0 && runLength >= minRepeats;
}
