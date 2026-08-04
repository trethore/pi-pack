import { mkdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { withFileMutationQueue } from '@earendil-works/pi-coding-agent';

import { hunkDisplayPath, type Hunk, parsePatch, type UpdateFileChunk } from '#src/features/apply-patch/parser.js';
import { seekSequence } from '#src/features/apply-patch/seek-sequence.js';
import { normalizeToolPath } from '#src/utils/paths.js';

export interface ApplyPatchOptions {
  cwd: string;
  workdir?: string;
  patch: string;
}

export interface ApplyPatchResult {
  added: string[];
  modified: string[];
  deleted: string[];
}

export class ApplyPatchFailure extends Error {
  readonly completed: ApplyPatchResult;
  readonly hunk: Hunk;
  readonly writtenMoveDestination?: string;

  constructor(
    completed: ApplyPatchResult,
    hunk: Hunk,
    cause: unknown,
    options: { writtenMoveDestination?: string } = {}
  ) {
    super(formatErrorMessage(cause), { cause });
    this.name = 'ApplyPatchFailure';
    this.completed = {
      added: [...completed.added],
      modified: [...completed.modified],
      deleted: [...completed.deleted],
    };
    this.hunk = hunk;
    this.writtenMoveDestination = options.writtenMoveDestination;
  }
}

class ApplyPatchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApplyPatchError';
  }
}

export async function applyPatch(options: ApplyPatchOptions): Promise<ApplyPatchResult> {
  const args = parsePatch(options.patch);
  const effectiveCwd = resolveWorkdir(options.cwd, options.workdir);
  const mutationPaths = await collectMutationPaths(args.hunks, effectiveCwd);

  return withFileMutationQueues(mutationPaths, () => applyHunks(args.hunks, effectiveCwd));
}

function resolveWorkdir(cwd: string, workdir: string | undefined): string {
  if (workdir === undefined) return path.resolve(cwd);
  const normalizedWorkdir = normalizeToolPath(workdir);
  return normalizedWorkdir.length === 0 ? path.resolve(cwd) : path.resolve(cwd, normalizedWorkdir);
}

async function collectMutationPaths(hunks: readonly Hunk[], cwd: string): Promise<string[]> {
  const mutationPaths = new Set<string>();

  for (const hunk of hunks) {
    mutationPaths.add(resolvePatchPath(cwd, hunk.path));
    if (hunk.type === 'update' && hunk.movePath !== undefined) {
      mutationPaths.add(resolvePatchPath(cwd, hunk.movePath));
    }
  }

  const queuePaths = new Set<string>();
  for (const filePath of mutationPaths) {
    queuePaths.add(await resolveMutationQueuePath(filePath));
  }
  return [...queuePaths].sort((left, right) => left.localeCompare(right));
}

async function resolveMutationQueuePath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch (error) {
    if (isMissingPathError(error)) return path.resolve(filePath);
    throw error;
  }
}

function withFileMutationQueues<T>(filePaths: readonly string[], operation: () => Promise<T>, index = 0): Promise<T> {
  const filePath = filePaths[index];
  if (filePath === undefined) return operation();
  return withFileMutationQueue(filePath, () => withFileMutationQueues(filePaths, operation, index + 1));
}

async function applyHunks(hunks: readonly Hunk[], cwd: string): Promise<ApplyPatchResult> {
  if (hunks.length === 0) throw new ApplyPatchError('No files were modified.');

  const summary: ApplyPatchResult = { added: [], modified: [], deleted: [] };

  for (const hunk of hunks) {
    try {
      if (hunk.type === 'add') {
        const targetPath = resolvePatchPath(cwd, hunk.path);
        await writeTextFile(targetPath, hunk.contents);
        summary.added.push(hunkDisplayPath(hunk));
      } else if (hunk.type === 'delete') {
        const targetPath = resolvePatchPath(cwd, hunk.path);
        await removeFile(targetPath, `Failed to delete file ${targetPath}`);
        summary.deleted.push(hunkDisplayPath(hunk));
      } else {
        await applyUpdateHunk(hunk, cwd);
        summary.modified.push(hunkDisplayPath(hunk));
      }
    } catch (error) {
      throw new ApplyPatchFailure(summary, hunk, error, {
        writtenMoveDestination: error instanceof MoveSourceRemovalError ? error.writtenMoveDestination : undefined,
      });
    }
  }

  return summary;
}

async function applyUpdateHunk(hunk: Extract<Hunk, { type: 'update' }>, cwd: string): Promise<void> {
  const targetPath = resolvePatchPath(cwd, hunk.path);
  const newContents = await deriveNewContentsFromChunks(targetPath, hunk.chunks);

  if (hunk.movePath === undefined) {
    await writeTextFile(targetPath, newContents);
    return;
  }

  const destinationPath = resolvePatchPath(cwd, hunk.movePath);
  await writeTextFile(destinationPath, newContents);
  try {
    await removeFile(targetPath, `Failed to remove original ${targetPath}`);
  } catch (error) {
    throw new MoveSourceRemovalError(error, destinationPath);
  }
}

class MoveSourceRemovalError extends Error {
  constructor(
    cause: unknown,
    readonly writtenMoveDestination: string
  ) {
    super(formatErrorMessage(cause), { cause });
    this.name = 'MoveSourceRemovalError';
  }
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  } catch (error) {
    throw new ApplyPatchError(`Failed to write file ${filePath}: ${formatErrorMessage(error)}`, { cause: error });
  }
}

function resolvePatchPath(cwd: string, patchPath: string): string {
  return path.resolve(cwd, patchPath);
}

async function removeFile(filePath: string, message: string): Promise<void> {
  await assertNotDirectory(filePath, message);
  try {
    await unlink(filePath);
  } catch (error) {
    throw new ApplyPatchError(message, { cause: error });
  }
}

async function readExistingFileForUpdate(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    throw new ApplyPatchError(`Failed to read file to update ${filePath}: ${formatErrorMessage(error)}`, {
      cause: error,
    });
  }
}

async function assertNotDirectory(filePath: string, message: string): Promise<void> {
  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) throw new ApplyPatchError(message, { cause: new Error('path is a directory') });
  } catch (error) {
    if (error instanceof ApplyPatchError) throw error;
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw new ApplyPatchError(message, { cause: error });
  }
}

async function deriveNewContentsFromChunks(filePath: string, chunks: readonly UpdateFileChunk[]): Promise<string> {
  const originalContents = await readExistingFileForUpdate(filePath);
  const originalLines = originalContents.split('\n');
  if (originalLines.at(-1) === '') originalLines.pop();

  const replacements = computeReplacements(originalLines, filePath, chunks);
  const newLines = applyReplacements(originalLines, replacements);
  if (newLines.at(-1) !== '') newLines.push('');

  return newLines.join('\n');
}

function computeReplacements(
  originalLines: readonly string[],
  filePath: string,
  chunks: readonly UpdateFileChunk[]
): Array<{ startIndex: number; oldLength: number; newLines: string[] }> {
  const replacements: Array<{ startIndex: number; oldLength: number; newLines: string[] }> = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    const result = computeChunkReplacement(originalLines, filePath, chunk, lineIndex);
    replacements.push(result.replacement);
    lineIndex = result.nextLineIndex;
  }

  return replacements.sort((left, right) => left.startIndex - right.startIndex);
}

function computeChunkReplacement(
  originalLines: readonly string[],
  filePath: string,
  chunk: UpdateFileChunk,
  lineIndex: number
): {
  replacement: { startIndex: number; oldLength: number; newLines: string[] };
  nextLineIndex: number;
} {
  const searchStartIndex = seekChangeContext(originalLines, filePath, chunk, lineIndex);
  if (chunk.oldLines.length === 0) {
    return {
      replacement: { startIndex: originalLines.length, oldLength: 0, newLines: [...chunk.newLines] },
      nextLineIndex: searchStartIndex,
    };
  }

  const match = findChunkMatch(originalLines, chunk, searchStartIndex);
  if (match === undefined) {
    throw new ApplyPatchError(`Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join('\n')}`);
  }

  return {
    replacement: { startIndex: match.startIndex, oldLength: match.pattern.length, newLines: [...match.newLines] },
    nextLineIndex: match.startIndex + match.pattern.length,
  };
}

function seekChangeContext(
  originalLines: readonly string[],
  filePath: string,
  chunk: UpdateFileChunk,
  lineIndex: number
): number {
  if (chunk.changeContext === undefined) return lineIndex;

  const contextIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
  if (contextIndex === undefined) {
    throw new ApplyPatchError(`Failed to find context '${chunk.changeContext}' in ${filePath}`);
  }
  return contextIndex + 1;
}

function findChunkMatch(
  originalLines: readonly string[],
  chunk: UpdateFileChunk,
  lineIndex: number
): { startIndex: number; pattern: readonly string[]; newLines: readonly string[] } | undefined {
  const directStartIndex = seekSequence(originalLines, chunk.oldLines, lineIndex, chunk.isEndOfFile);
  if (directStartIndex !== undefined) {
    return { startIndex: directStartIndex, pattern: chunk.oldLines, newLines: chunk.newLines };
  }

  const normalized = normalizeTrailingBlankLine(chunk.oldLines, chunk.newLines);
  if (normalized === undefined) return undefined;

  const normalizedStartIndex = seekSequence(originalLines, normalized.pattern, lineIndex, chunk.isEndOfFile);
  return normalizedStartIndex === undefined ? undefined : { startIndex: normalizedStartIndex, ...normalized };
}

function normalizeTrailingBlankLine(
  pattern: readonly string[],
  newLines: readonly string[]
): { pattern: readonly string[]; newLines: readonly string[] } | undefined {
  if (pattern.at(-1) !== '') return undefined;
  return {
    pattern: pattern.slice(0, -1),
    newLines: newLines.at(-1) === '' ? newLines.slice(0, -1) : newLines,
  };
}

function applyReplacements(
  originalLines: readonly string[],
  replacements: ReadonlyArray<{ startIndex: number; oldLength: number; newLines: readonly string[] }>
): string[] {
  const lines = [...originalLines];

  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const replacement = replacements[index];
    if (replacement === undefined) continue;
    lines.splice(replacement.startIndex, replacement.oldLength, ...replacement.newLines);
  }

  return lines;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isMissingPathError(error: unknown): boolean {
  return isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}
