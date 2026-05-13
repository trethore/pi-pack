import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withFileMutationQueue } from '@earendil-works/pi-coding-agent';

export type ApplyPatchOperation = {
  type:
    | 'create_file'
    | 'update_file'
    | 'delete_file'
    | 'create'
    | 'update'
    | 'delete'
    | 'add'
    | 'modify'
    | 'remove';
  path: string;
  diff?: string;
};

type CanonicalApplyPatchOperation =
  | {
      type: 'create_file';
      path: string;
      diff: string;
    }
  | {
      type: 'update_file';
      path: string;
      diff: string;
    }
  | {
      type: 'delete_file';
      path: string;
    };

export interface ApplyPatchResult {
  status: 'completed' | 'failed';
  output: string;
}

interface ParsedHunk {
  oldLines: string[];
  newLines: string[];
}

export async function applyPatchOperation(
  cwd: string,
  operation: ApplyPatchOperation
): Promise<ApplyPatchResult> {
  try {
    const canonicalOperation = normalizeOperation(operation);
    const targetPath = resolveWorkspacePath(cwd, canonicalOperation.path);

    return await withFileMutationQueue(targetPath, async () => {
      switch (canonicalOperation.type) {
        case 'create_file': {
          const content = applyDiff('', canonicalOperation.diff, { create: true });
          await mkdir(path.dirname(targetPath), { recursive: true });
          await writeFile(targetPath, content, { encoding: 'utf8', flag: 'wx' });
          return { status: 'completed', output: `Created ${canonicalOperation.path}` };
        }
        case 'update_file': {
          const currentContent = await readFile(targetPath, 'utf8');
          const newContent = applyDiff(currentContent, canonicalOperation.diff);
          await writeFile(targetPath, newContent, 'utf8');
          return { status: 'completed', output: `Updated ${canonicalOperation.path}` };
        }
        case 'delete_file': {
          await rm(targetPath, { force: false });
          return { status: 'completed', output: `Deleted ${canonicalOperation.path}` };
        }
      }
    });
  } catch (error) {
    return { status: 'failed', output: formatError(error) };
  }
}

function normalizeOperation(operation: ApplyPatchOperation): CanonicalApplyPatchOperation {
  switch (operation.type) {
    case 'add':
    case 'create':
    case 'create_file': {
      return { type: 'create_file', path: operation.path, diff: requireDiff(operation) };
    }
    case 'modify':
    case 'update':
    case 'update_file': {
      return { type: 'update_file', path: operation.path, diff: requireDiff(operation) };
    }
    case 'remove':
    case 'delete':
    case 'delete_file': {
      return { type: 'delete_file', path: operation.path };
    }
  }
}

function requireDiff(operation: ApplyPatchOperation): string {
  if (operation.diff !== undefined) return operation.diff;
  throw new Error(`Invalid ${operation.type} operation: diff is required`);
}

export function applyDiff(
  currentContent: string,
  diff: string,
  options: { create?: boolean } = {}
): string {
  if (options.create && !diff.includes('@@')) return normalizeCreatedContent(diff);

  const hunks = parseDiff(diff);
  if (hunks.length === 0) {
    if (options.create) return normalizeCreatedContent(diff);
    throw new Error('Invalid diff: no hunks found');
  }

  const current = splitContent(currentContent);
  const currentLines = current.lines;
  let searchStartIndex = 0;

  for (const hunk of hunks) {
    const matchIndex = findLineSequence(currentLines, hunk.oldLines, searchStartIndex);
    if (matchIndex === -1) {
      throw new Error(`Invalid Context:\n${formatContext(hunk.oldLines)}`);
    }

    currentLines.splice(matchIndex, hunk.oldLines.length, ...hunk.newLines);
    searchStartIndex = matchIndex + hunk.newLines.length;
  }

  return joinContent(currentLines, current.hasTrailingNewline);
}

function resolveWorkspacePath(cwd: string, requestedPath: string): string {
  if (path.isAbsolute(requestedPath)) {
    throw new Error(`Invalid path '${requestedPath}': absolute paths are not allowed`);
  }

  const workspaceRoot = path.resolve(cwd);
  const targetPath = path.resolve(workspaceRoot, requestedPath);
  const relativePath = path.relative(workspaceRoot, targetPath);

  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid path '${requestedPath}': path escapes the workspace`);
  }

  return targetPath;
}

function normalizeCreatedContent(diff: string): string {
  const lines = diff.replaceAll('\r\n', '\n').split('\n');
  const contentLines = lines.map((line) => (line.startsWith('+') ? line.slice(1) : line));
  return contentLines.join('\n');
}

function parseDiff(diff: string): ParsedHunk[] {
  const normalizedLines = splitDiffLines(diff);
  const hunks: ParsedHunk[] = [];
  let currentHunk: ParsedHunk | undefined;

  for (const line of normalizedLines) {
    if (line.startsWith('@@')) {
      currentHunk = { oldLines: [], newLines: [] };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk || line === String.raw`\ No newline at end of file`) continue;

    if (line.startsWith('+')) {
      currentHunk.newLines.push(line.slice(1));
    } else if (line.startsWith('-')) {
      currentHunk.oldLines.push(line.slice(1));
    } else if (line.startsWith(' ')) {
      const contextLine = line.slice(1);
      currentHunk.oldLines.push(contextLine);
      currentHunk.newLines.push(contextLine);
    } else {
      currentHunk.oldLines.push(line);
      currentHunk.newLines.push(line);
    }
  }

  return hunks.filter((hunk) => hunk.oldLines.length > 0 || hunk.newLines.length > 0);
}

function splitDiffLines(diff: string): string[] {
  const lines = diff.replaceAll('\r\n', '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function splitContent(content: string): { lines: string[]; hasTrailingNewline: boolean } {
  const normalizedContent = content.replaceAll('\r\n', '\n');
  const hasTrailingNewline = normalizedContent.endsWith('\n');
  const lines = normalizedContent.split('\n');
  if (hasTrailingNewline) lines.pop();
  return { lines, hasTrailingNewline };
}

function joinContent(lines: string[], hasTrailingNewline: boolean): string {
  return `${lines.join('\n')}${hasTrailingNewline ? '\n' : ''}`;
}

function findLineSequence(lines: string[], sequence: string[], startIndex: number): number {
  if (sequence.length === 0) return startIndex;

  for (let index = startIndex; index <= lines.length - sequence.length; index += 1) {
    if (sequence.every((line, offset) => lines[index + offset] === line)) return index;
  }

  return -1;
}

function formatContext(lines: string[]): string {
  if (lines.length === 0) return '@@';
  return lines.map((line) => ` ${line}`).join('\n');
}

function formatError(error: unknown): string {
  if (error instanceof Error) return `Error: ${error.message}`;
  return 'Error: Unknown apply_patch failure';
}
