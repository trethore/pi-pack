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
): { newContent: string; replacementCount: number } {
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

  return { newContent, replacementCount: matchedEdits.length };
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
