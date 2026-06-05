import {
  getDuplicateError,
  getEmptyOldTextError,
  getNoChangeError,
  getNotFoundError,
  getOverlapError,
} from '#src/features/custom-edit/errors.js';
import type { CustomEdit, MatchedEdit } from '#src/features/custom-edit/types.js';

export function applyCustomEdits(
  normalizedContent: string,
  edits: CustomEdit[],
  filePath: string
): { baseContent: string; newContent: string; replacementCount: number } {
  const normalizedEdits = edits.map((edit) => ({
    oldText: normalizeToLF(edit.oldText),
    newText: normalizeToLF(edit.newText),
    replaceAll: edit.replaceAll === true,
  }));

  for (const [index, edit] of normalizedEdits.entries()) {
    if (edit.oldText.length === 0) throw getEmptyOldTextError(filePath, index, edits.length);
  }

  const matchedEdits = normalizedEdits.flatMap((edit, editIndex) => {
    const matches = findAllExactMatches(normalizedContent, edit.oldText);

    if (matches.length === 0) throw getNotFoundError(filePath, editIndex, edits.length);
    if (!edit.replaceAll && matches.length > 1) {
      throw getDuplicateError(filePath, editIndex, edits.length, matches.length);
    }

    return matches.map((matchIndex) => ({
      editIndex,
      matchIndex,
      matchLength: edit.oldText.length,
      newText: edit.newText,
    }));
  });

  assertNoOverlaps(matchedEdits, filePath);

  let newContent = normalizedContent;
  for (let i = matchedEdits.length - 1; i >= 0; i--) {
    const edit = matchedEdits[i];
    newContent =
      newContent.slice(0, edit.matchIndex) +
      edit.newText +
      newContent.slice(edit.matchIndex + edit.matchLength);
  }

  if (normalizedContent === newContent) throw getNoChangeError(filePath, edits.length);

  return { baseContent: normalizedContent, newContent, replacementCount: matchedEdits.length };
}

export function generateUnifiedPatch(
  filePath: string,
  oldContent: string,
  newContent: string
): string {
  const oldLineCount = splitDisplayLines(oldContent).length;
  const newLineCount = splitDisplayLines(newContent).length;
  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ -1,${oldLineCount} +1,${newLineCount} @@`,
    ...formatWholeFilePatchLines('-', oldContent),
    ...formatWholeFilePatchLines('+', newContent),
    '',
  ].join('\n');
}

export function generateDiffString(
  oldContent: string,
  newContent: string
): { diff: string; firstChangedLine: number | undefined } {
  const oldLines = splitDisplayLines(oldContent);
  const newLines = splitDisplayLines(newContent);
  const prefixLength = countCommonPrefix(oldLines, newLines);
  const suffixLength = countCommonSuffix(oldLines, newLines, prefixLength);
  const maxLineNumber = Math.max(oldLines.length, newLines.length);
  const lineNumberWidth = String(maxLineNumber).length;
  const output: string[] = [];
  const contextLines = 4;
  const contextStart = Math.max(0, prefixLength - contextLines);
  const oldChangeEnd = oldLines.length - suffixLength;
  const newChangeEnd = newLines.length - suffixLength;
  const contextEndOld = Math.min(oldLines.length, oldChangeEnd + contextLines);
  const firstChangedLine =
    oldChangeEnd > prefixLength || newChangeEnd > prefixLength ? prefixLength + 1 : undefined;

  if (contextStart > 0) output.push(` ${''.padStart(lineNumberWidth, ' ')} ...`);

  for (let index = contextStart; index < prefixLength; index++) {
    output.push(formatDiffLine(' ', index + 1, oldLines[index], lineNumberWidth));
  }

  for (let index = prefixLength; index < oldChangeEnd; index++) {
    output.push(formatDiffLine('-', index + 1, oldLines[index], lineNumberWidth));
  }

  for (let index = prefixLength; index < newChangeEnd; index++) {
    output.push(formatDiffLine('+', index + 1, newLines[index], lineNumberWidth));
  }

  for (let index = oldChangeEnd; index < contextEndOld; index++) {
    output.push(formatDiffLine(' ', index + 1, oldLines[index], lineNumberWidth));
  }

  if (contextEndOld < oldLines.length) output.push(` ${''.padStart(lineNumberWidth, ' ')} ...`);

  return { diff: output.join('\n'), firstChangedLine };
}

function splitDisplayLines(content: string): string[] {
  const lines = content.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function countCommonPrefix(oldLines: string[], newLines: string[]): number {
  const maxLength = Math.min(oldLines.length, newLines.length);
  let index = 0;
  while (index < maxLength && oldLines[index] === newLines[index]) index++;
  return index;
}

function countCommonSuffix(oldLines: string[], newLines: string[], prefixLength: number): number {
  const maxLength = Math.min(oldLines.length, newLines.length) - prefixLength;
  let offset = 0;
  while (
    offset < maxLength &&
    oldLines[oldLines.length - 1 - offset] === newLines[newLines.length - 1 - offset]
  ) {
    offset++;
  }
  return offset;
}

function formatDiffLine(
  prefix: ' ' | '-' | '+',
  lineNumber: number,
  line: string,
  width: number
): string {
  return `${prefix}${String(lineNumber).padStart(width, ' ')} ${line}`;
}

function formatWholeFilePatchLines(prefix: '-' | '+', content: string): string[] {
  return splitDisplayLines(content).map((line) => `${prefix}${line}`);
}

export function detectLineEnding(content: string): '\r\n' | '\n' {
  const crlfIndex = content.indexOf('\r\n');
  const lfIndex = content.indexOf('\n');
  if (lfIndex === -1) return '\n';
  if (crlfIndex === -1) return '\n';
  return crlfIndex < lfIndex ? '\r\n' : '\n';
}

export function normalizeToLF(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

export function restoreLineEndings(text: string, ending: '\r\n' | '\n'): string {
  return ending === '\r\n' ? text.replaceAll('\n', '\r\n') : text;
}

export function stripBom(content: string): { bom: string; text: string } {
  return content.startsWith('\uFEFF')
    ? { bom: '\uFEFF', text: content.slice(1) }
    : { bom: '', text: content };
}

function findAllExactMatches(content: string, oldText: string): number[] {
  const matches: number[] = [];
  let index = content.indexOf(oldText);

  while (index !== -1) {
    matches.push(index);
    index = content.indexOf(oldText, index + oldText.length);
  }

  return matches;
}

function assertNoOverlaps(matchedEdits: MatchedEdit[], filePath: string): void {
  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);

  for (const [offset, current] of matchedEdits.slice(1).entries()) {
    const previous = matchedEdits[offset];

    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
      throw getOverlapError(filePath, previous.editIndex, current.editIndex);
    }
  }
}
