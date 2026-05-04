import type { RepetitionFoldingConfig } from '#src/config/schema.js';
import { type LineParts, splitLines } from '#src/shared/line.js';

export const MAX_FOLDING_LINES = 10_000;
const CHARS_PER_TOKEN = 4;

export function foldRepeatedOutput(text: string, config: RepetitionFoldingConfig): string {
  if (!config.enabled) return text;
  if (exceedsMaxFoldingLines(text)) return text;

  const context = makeFoldingContext(splitLines(text));
  const foldedLines: string[] = [];
  let changed = false;
  let index = 0;

  while (index < context.lines.length) {
    const candidate = findBestCandidate(context, index, config);

    if (candidate) {
      for (let segmentIndex = 0; segmentIndex < candidate.lineCount; segmentIndex += 1) {
        foldedLines.push(context.lines[index + segmentIndex].raw);
      }

      foldedLines.push(candidate.marker);
      changed = true;
      index += candidate.lineCount * candidate.repeatCount;
      continue;
    }

    foldedLines.push(context.lines[index].raw);
    index += 1;
  }

  return changed ? foldedLines.join('') : text;
}

interface FoldingContext {
  lines: LineParts[];
  rawCharOffsets: number[];
  nonEmptyLineOffsets: number[];
}

interface RepetitionCandidate {
  lineCount: number;
  repeatCount: number;
  savedLines: number;
  savedTokens: number;
  marker: string;
}

function makeFoldingContext(lines: LineParts[]): FoldingContext {
  const rawCharOffsets = [0];
  const nonEmptyLineOffsets = [0];

  for (const line of lines) {
    const previousRawChars = rawCharOffsets.at(-1)!;
    const previousNonEmptyLines = nonEmptyLineOffsets.at(-1)!;

    rawCharOffsets.push(previousRawChars + line.raw.length);
    nonEmptyLineOffsets.push(previousNonEmptyLines + (line.body.length > 0 ? 1 : 0));
  }

  return { lines, rawCharOffsets, nonEmptyLineOffsets };
}

function findBestCandidate(
  context: FoldingContext,
  startIndex: number,
  config: RepetitionFoldingConfig
): RepetitionCandidate | undefined {
  const maxLineCount = Math.floor((context.lines.length - startIndex) / config.minRepeats);
  let bestCandidate: RepetitionCandidate | undefined;

  for (let lineCount = 1; lineCount <= maxLineCount; lineCount += 1) {
    if (isEmptySegment(context, startIndex, lineCount)) continue;

    const repeatCount = countSegmentRepeats(context.lines, startIndex, lineCount);
    if (repeatCount < config.minRepeats) continue;

    const candidate = makeCandidate(context, startIndex, lineCount, repeatCount);
    if (!passesSavingsChecks(candidate, config)) continue;
    if (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function isEmptySegment(context: FoldingContext, startIndex: number, lineCount: number): boolean {
  return countNonEmptyLines(context, startIndex, lineCount) === 0;
}

function countSegmentRepeats(lines: LineParts[], startIndex: number, lineCount: number): number {
  let repeatCount = 1;

  while (segmentEquals(lines, startIndex, startIndex + repeatCount * lineCount, lineCount)) {
    repeatCount += 1;
  }

  return repeatCount;
}

function segmentEquals(
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

function makeCandidate(
  context: FoldingContext,
  startIndex: number,
  lineCount: number,
  repeatCount: number
): RepetitionCandidate {
  const repeatedLineCount = lineCount * repeatCount;
  const ending = context.lines[startIndex + repeatedLineCount - 1]?.ending ?? '';
  const marker = makeMarker(lineCount, repeatCount, ending);
  const savedLines = lineCount * (repeatCount - 1) - 1;
  const savedChars =
    countRawChars(context, startIndex + lineCount, repeatedLineCount - lineCount) - marker.length;
  const savedTokens = estimateTokens(savedChars);

  return { lineCount, repeatCount, savedLines, savedTokens, marker };
}

function countRawChars(context: FoldingContext, startIndex: number, lineCount: number): number {
  return context.rawCharOffsets[startIndex + lineCount] - context.rawCharOffsets[startIndex];
}

function countNonEmptyLines(
  context: FoldingContext,
  startIndex: number,
  lineCount: number
): number {
  return (
    context.nonEmptyLineOffsets[startIndex + lineCount] - context.nonEmptyLineOffsets[startIndex]
  );
}

function estimateTokens(chars: number): number {
  return Math.max(0, Math.ceil(chars / CHARS_PER_TOKEN));
}

function passesSavingsChecks(
  candidate: RepetitionCandidate,
  config: RepetitionFoldingConfig
): boolean {
  if (candidate.savedTokens <= 0) return false;

  const savedLinesCheck = getSavingsCheck(config.minSavedLines, candidate.savedLines);
  const savedTokensCheck = getSavingsCheck(config.minSavedTokens, candidate.savedTokens);
  if (savedLinesCheck === undefined && savedTokensCheck === undefined) return true;

  return combineSavingsChecks(savedLinesCheck, savedTokensCheck, config.savingsMode);
}

function getSavingsCheck(minimum: number, actual: number): boolean | undefined {
  return minimum > 0 ? actual >= minimum : undefined;
}

function combineSavingsChecks(
  left: boolean | undefined,
  right: boolean | undefined,
  savingsMode: RepetitionFoldingConfig['savingsMode']
): boolean {
  const leftPassed = left ?? false;
  const rightPassed = right ?? false;

  if (savingsMode === 'or') return leftPassed || rightPassed;
  return (left ?? true) && (right ?? true);
}

function compareCandidates(left: RepetitionCandidate, right: RepetitionCandidate): number {
  if (left.savedTokens !== right.savedTokens) return right.savedTokens - left.savedTokens;
  if (left.savedLines !== right.savedLines) return right.savedLines - left.savedLines;
  if (left.lineCount !== right.lineCount) return left.lineCount - right.lineCount;
  return right.repeatCount - left.repeatCount;
}

function makeMarker(lineCount: number, repeatCount: number, ending: string): string {
  const foldedRepeatCount = repeatCount - 1;
  if (lineCount === 1) return `[previous line repeated x${foldedRepeatCount}]${ending}`;
  return `[previous block of ${lineCount} lines repeated x${foldedRepeatCount}]${ending}`;
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
