import type { RepetitionFoldingConfig } from '#src/config/schema.js';
import { makeRepetitionMarker } from '#src/features/repetition-folding/repetition-marker.js';
import { type LineParts, splitLines } from '#src/shared/line.js';

export const MAX_FOLDING_LINES = 10_000;
const CHARS_PER_TOKEN = 4;

export function foldRepeatedOutput(text: string, config: RepetitionFoldingConfig): string {
  if (!config.enabled) return text;
  if (exceedsMaxFoldingLines(text)) return text;

  const context = makeFoldingContext(splitLines(text));
  if (context.nonEmptyLineOffsets.at(-1) === 0) return text;

  const comparisonBudget: ComparisonBudget = { remaining: config.maxComparisons };
  const foldedLines: string[] = [];
  let changed = false;
  let index = 0;

  while (index < context.lines.length) {
    const result = findBestCandidate(context, index, config, comparisonBudget);
    if (result.exhausted) {
      if (result.candidate) {
        appendCandidate(foldedLines, context.lines, index, result.candidate);
        changed = true;
        index += result.candidate.lineCount * result.candidate.repeatCount;
      }
      appendRemainingLines(foldedLines, context.lines, index);
      return changed ? foldedLines.join('') : text;
    }

    const candidate = result.candidate;

    if (candidate) {
      appendCandidate(foldedLines, context.lines, index, candidate);
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

interface ComparisonBudget {
  remaining: number;
}

interface CandidateSearchResult {
  candidate?: RepetitionCandidate;
  exhausted: boolean;
}

interface RepeatCountResult {
  repeatCount: number;
  exhausted: boolean;
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
  config: RepetitionFoldingConfig,
  comparisonBudget: ComparisonBudget
): CandidateSearchResult {
  const maxLineCount = Math.floor((context.lines.length - startIndex) / config.minRepeats);
  let bestCandidate: RepetitionCandidate | undefined;

  for (let lineCount = 1; lineCount <= maxLineCount; lineCount += 1) {
    if (!consumeComparison(comparisonBudget)) return { candidate: bestCandidate, exhausted: true };
    if (isEmptySegment(context, startIndex, lineCount)) continue;

    const repeatResult = countSegmentRepeats(context.lines, startIndex, lineCount, comparisonBudget);
    if (repeatResult.repeatCount >= config.minRepeats) {
      const candidate = makeCandidate(context, startIndex, lineCount, repeatResult.repeatCount);
      if (
        passesSavingsChecks(candidate, config) &&
        (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0)
      ) {
        bestCandidate = candidate;
      }
    }

    if (repeatResult.exhausted) return { candidate: bestCandidate, exhausted: true };
  }

  return { candidate: bestCandidate, exhausted: false };
}

function isEmptySegment(context: FoldingContext, startIndex: number, lineCount: number): boolean {
  return countNonEmptyLines(context, startIndex, lineCount) === 0;
}

function countSegmentRepeats(
  lines: LineParts[],
  startIndex: number,
  lineCount: number,
  comparisonBudget: ComparisonBudget
): RepeatCountResult {
  let repeatCount = 1;

  while (true) {
    const segmentsEqual = segmentEquals(
      lines,
      startIndex,
      startIndex + repeatCount * lineCount,
      lineCount,
      comparisonBudget
    );
    if (segmentsEqual === undefined) return { repeatCount, exhausted: true };
    if (!segmentsEqual) return { repeatCount, exhausted: false };
    repeatCount += 1;
  }
}

function segmentEquals(
  lines: LineParts[],
  leftStartIndex: number,
  rightStartIndex: number,
  lineCount: number,
  comparisonBudget: ComparisonBudget
): boolean | undefined {
  if (rightStartIndex + lineCount > lines.length) return false;

  for (let index = 0; index < lineCount; index += 1) {
    if (!consumeComparison(comparisonBudget)) return undefined;
    if (lines[leftStartIndex + index].body !== lines[rightStartIndex + index].body) return false;
  }

  return true;
}

function consumeComparison(comparisonBudget: ComparisonBudget): boolean {
  if (comparisonBudget.remaining === 0) return false;
  comparisonBudget.remaining -= 1;
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
  const marker = `${makeRepetitionMarker(lineCount, repeatCount)}${ending}`;
  const savedLines = lineCount * (repeatCount - 1) - 1;
  const savedChars = countRawChars(context, startIndex + lineCount, repeatedLineCount - lineCount) - marker.length;
  const savedTokens = estimateTokens(savedChars);

  return { lineCount, repeatCount, savedLines, savedTokens, marker };
}

function countRawChars(context: FoldingContext, startIndex: number, lineCount: number): number {
  return context.rawCharOffsets[startIndex + lineCount] - context.rawCharOffsets[startIndex];
}

function countNonEmptyLines(context: FoldingContext, startIndex: number, lineCount: number): number {
  return context.nonEmptyLineOffsets[startIndex + lineCount] - context.nonEmptyLineOffsets[startIndex];
}

function estimateTokens(chars: number): number {
  return Math.max(0, Math.ceil(chars / CHARS_PER_TOKEN));
}

function passesSavingsChecks(candidate: RepetitionCandidate, config: RepetitionFoldingConfig): boolean {
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

function appendCandidate(
  target: string[],
  lines: LineParts[],
  startIndex: number,
  candidate: RepetitionCandidate
): void {
  for (let segmentIndex = 0; segmentIndex < candidate.lineCount; segmentIndex += 1) {
    target.push(lines[startIndex + segmentIndex].raw);
  }
  target.push(candidate.marker);
}

function appendRemainingLines(target: string[], lines: LineParts[], startIndex: number): void {
  for (let index = startIndex; index < lines.length; index += 1) {
    target.push(lines[index].raw);
  }
}

function exceedsMaxFoldingLines(text: string): boolean {
  const lineCount = countLinesUpTo(text, MAX_FOLDING_LINES + 1);
  return lineCount > MAX_FOLDING_LINES;
}

function countLinesUpTo(text: string, maxLines: number): number {
  let lineCount = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!isLineEnding(text[index])) continue;
    lineCount += 1;
    if (lineCount >= maxLines) return lineCount;

    if (isCrLfAt(text, index)) index += 1;
  }

  return hasTrailingLine(text) ? lineCount + 1 : lineCount;
}

function isLineEnding(character: string): boolean {
  return character === '\r' || character === '\n';
}

function isCrLfAt(text: string, index: number): boolean {
  return text[index] === '\r' && text[index + 1] === '\n';
}

function hasTrailingLine(text: string): boolean {
  return text.length > 0 && !isLineEnding(text.at(-1)!);
}
