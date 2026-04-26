import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { applyEdits, modify, parse, type FormattingOptions, type JSONPath } from 'jsonc-parser';
import { isRecord } from '#src/shared/object.js';

const REMOVE_JSONC_VALUE: unknown = undefined;

export interface JsoncFileUpdate {
  path: readonly string[];
  value: unknown;
}

export async function updateJsoncFile(
  filePath: string,
  updates: readonly JsoncFileUpdate[],
  cleanupObjectPaths: readonly (readonly string[])[] = []
): Promise<void> {
  const fileExists = existsSync(filePath);
  let text = fileExists ? await readFile(filePath, 'utf8') : '{}\n';
  let changed = false;

  for (const update of updates) {
    const nextText = applyJsoncUpdate(text, update.path, update.value);
    changed ||= nextText !== text;
    text = nextText;
  }

  for (const cleanupPath of sortLongestPathsFirst(cleanupObjectPaths)) {
    if (!isEmptyObjectAtPath(text, cleanupPath)) continue;

    const nextText = applyJsoncUpdate(text, cleanupPath, REMOVE_JSONC_VALUE);
    changed ||= nextText !== text;
    text = nextText;
  }

  const textWithTrailingNewline = ensureTrailingNewline(text, detectEol(text));
  if (!changed && textWithTrailingNewline === text) return;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, textWithTrailingNewline, 'utf8');
}

function applyJsoncUpdate(text: string, updatePath: readonly string[], value: unknown): string {
  const edits = modify(text, updatePath as JSONPath, value, {
    formattingOptions: getFormattingOptions(text),
  });

  return edits.length === 0 ? text : applyEdits(text, edits);
}

function getFormattingOptions(text: string): FormattingOptions {
  const indentation = detectIndentation(text);

  return {
    insertSpaces: indentation.insertSpaces,
    tabSize: indentation.tabSize,
    eol: detectEol(text),
    insertFinalNewline: true,
  };
}

function detectIndentation(text: string): { insertSpaces: boolean; tabSize: number } {
  const match = /^(\s+)\S/m.exec(text);
  if (!match) return { insertSpaces: true, tabSize: 2 };

  const indentation = match[1];
  if (indentation.includes('\t')) return { insertSpaces: false, tabSize: 1 };

  return { insertSpaces: true, tabSize: Math.max(indentation.length, 1) };
}

function sortLongestPathsFirst(
  paths: readonly (readonly string[])[]
): readonly (readonly string[])[] {
  // ES2022 target does not include Array#toSorted.
  // eslint-disable-next-line unicorn/no-array-sort
  return [...paths].sort((left, right) => right.length - left.length);
}

function isEmptyObjectAtPath(text: string, objectPath: readonly string[]): boolean {
  const parsed = parse(text, undefined, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as unknown;
  const valueAtPath = getValueAtPath(parsed, objectPath);
  return isRecord(valueAtPath) && Object.keys(valueAtPath).length === 0;
}

function getValueAtPath(value: unknown, objectPath: readonly string[]): unknown {
  let current: unknown = value;

  for (const segment of objectPath) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }

  return current;
}

function detectEol(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function ensureTrailingNewline(text: string, eol: string): string {
  return text.endsWith('\n') ? text : `${text}${eol}`;
}
