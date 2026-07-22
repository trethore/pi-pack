import { chmod, mkdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
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

type PlannedOperation =
  | { type: 'write'; path: string; content: string }
  | { type: 'delete'; path: string }
  | { type: 'move'; sourcePath: string; destinationPath: string; content: string };

interface PlannedPatch {
  operations: PlannedOperation[];
  summary: ApplyPatchResult;
}

type FileSnapshot = { exists: false } | { exists: true; content: string; mode: number };

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

  return withFileMutationQueues(mutationPaths, async () => {
    const plannedPatch = await planPatch(args.hunks, effectiveCwd);

    if (plannedPatch.operations.length === 0) {
      throw new ApplyPatchError('No files were modified.');
    }

    await commitPatch(plannedPatch.operations);
    return plannedPatch.summary;
  });
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

async function planPatch(hunks: readonly Hunk[], cwd: string): Promise<PlannedPatch> {
  const state = new Map<string, string | null>();
  const operations: PlannedOperation[] = [];
  const summary: ApplyPatchResult = { added: [], modified: [], deleted: [] };

  for (const hunk of hunks) {
    if (hunk.type === 'add') {
      const targetPath = resolvePatchPath(cwd, hunk.path);
      await assertAvailableFilePath(targetPath, state, `Failed to add file ${targetPath}: path already exists`);
      state.set(targetPath, hunk.contents);
      operations.push({ type: 'write', path: targetPath, content: hunk.contents });
      summary.added.push(hunkDisplayPath(hunk));
    } else if (hunk.type === 'delete') {
      const targetPath = resolvePatchPath(cwd, hunk.path);
      await assertExistingFileForDelete(targetPath, state);
      state.set(targetPath, null);
      operations.push({ type: 'delete', path: targetPath });
      summary.deleted.push(hunkDisplayPath(hunk));
    } else {
      await planUpdateHunk(hunk, cwd, state, operations);
      summary.modified.push(hunkDisplayPath(hunk));
    }
  }

  return { operations, summary };
}

async function planUpdateHunk(
  hunk: Extract<Hunk, { type: 'update' }>,
  cwd: string,
  state: Map<string, string | null>,
  operations: PlannedOperation[]
): Promise<void> {
  const targetPath = resolvePatchPath(cwd, hunk.path);
  const newContents = await deriveNewContentsFromChunks(targetPath, hunk.chunks, state);

  if (hunk.movePath === undefined) {
    state.set(targetPath, newContents);
    operations.push({ type: 'write', path: targetPath, content: newContents });
    return;
  }

  const destinationPath = resolvePatchPath(cwd, hunk.movePath);
  if (destinationPath !== targetPath) {
    await assertAvailableFilePath(
      destinationPath,
      state,
      `Failed to move file to ${destinationPath}: destination already exists`
    );
  }
  state.set(destinationPath, newContents);
  if (destinationPath !== targetPath) state.set(targetPath, null);
  operations.push({ type: 'move', sourcePath: targetPath, destinationPath, content: newContents });
}

async function commitPatch(operations: readonly PlannedOperation[]): Promise<void> {
  const snapshots = await captureSnapshots(operations);
  const possiblyMutatedPaths = new Set<string>();

  try {
    for (const operation of operations) {
      recordPossiblyMutatedPaths(possiblyMutatedPaths, operation);
      await commitOperation(operation);
    }
  } catch (error) {
    const rollbackErrors = await rollbackFiles(possiblyMutatedPaths, snapshots);
    const rollbackSuffix = rollbackErrors.length === 0 ? '' : ` Rollback failed: ${rollbackErrors.join('; ')}`;
    throw new ApplyPatchError(`Failed to commit patch: ${formatErrorMessage(error)}.${rollbackSuffix}`, {
      cause: error,
    });
  }
}

function recordPossiblyMutatedPaths(paths: Set<string>, operation: PlannedOperation): void {
  for (const filePath of operationPaths(operation)) {
    paths.add(filePath);
  }
}

async function commitOperation(operation: PlannedOperation): Promise<void> {
  if (operation.type === 'write') {
    await writeTextFile(operation.path, operation.content);
    return;
  }
  if (operation.type === 'delete') {
    await unlink(operation.path);
    return;
  }

  await writeTextFile(operation.destinationPath, operation.content);
  if (operation.sourcePath !== operation.destinationPath) await unlink(operation.sourcePath);
}

async function captureSnapshots(operations: readonly PlannedOperation[]): Promise<Map<string, FileSnapshot>> {
  const filePaths = new Set(operations.flatMap((operation) => operationPaths(operation)));
  const snapshots = new Map<string, FileSnapshot>();

  for (const filePath of filePaths) {
    snapshots.set(filePath, await captureSnapshot(filePath));
  }

  return snapshots;
}

async function captureSnapshot(filePath: string): Promise<FileSnapshot> {
  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) throw new ApplyPatchError(`Failed to snapshot ${filePath}: path is a directory`);
    return { exists: true, content: await readFile(filePath, 'utf8'), mode: stats.mode & 0o7777 };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return { exists: false };
    throw error;
  }
}

function operationPaths(operation: PlannedOperation): string[] {
  if (operation.type === 'write' || operation.type === 'delete') return [operation.path];
  return operation.sourcePath === operation.destinationPath
    ? [operation.sourcePath]
    : [operation.sourcePath, operation.destinationPath];
}

async function rollbackFiles(
  possiblyMutatedPaths: ReadonlySet<string>,
  snapshots: ReadonlyMap<string, FileSnapshot>
): Promise<string[]> {
  const rollbackErrors: string[] = [];
  const filePaths = [...possiblyMutatedPaths];

  for (let index = filePaths.length - 1; index >= 0; index -= 1) {
    const filePath = filePaths[index];
    if (filePath === undefined) continue;
    const snapshot = snapshots.get(filePath);
    if (snapshot === undefined) continue;

    try {
      await restoreSnapshot(filePath, snapshot);
    } catch (error) {
      rollbackErrors.push(`${filePath}: ${formatErrorMessage(error)}`);
    }
  }

  return rollbackErrors;
}

async function restoreSnapshot(filePath: string, snapshot: FileSnapshot): Promise<void> {
  if (!snapshot.exists) {
    try {
      await unlink(filePath);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
    return;
  }

  await writeTextFile(filePath, snapshot.content);
  await chmod(filePath, snapshot.mode);
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

function resolvePatchPath(cwd: string, patchPath: string): string {
  return path.resolve(cwd, patchPath);
}

async function assertExistingFileForDelete(filePath: string, state: Map<string, string | null>): Promise<void> {
  if (state.has(filePath)) {
    const content = state.get(filePath);
    if (content === null) throw new ApplyPatchError(`Failed to delete file ${filePath}`);
    if (content !== undefined) return;
  }

  await assertNotDirectory(filePath, `Failed to delete file ${filePath}`);
  try {
    await readFile(filePath, 'utf8');
  } catch (error) {
    throw new ApplyPatchError(`Failed to delete file ${filePath}`, { cause: error });
  }
}

async function readExistingFileForUpdate(filePath: string, state: Map<string, string | null>): Promise<string> {
  if (state.has(filePath)) {
    const content = state.get(filePath);
    if (content === null)
      throw new ApplyPatchError(`Failed to read file to update ${filePath}: No such file or directory`);
    if (content !== undefined) return content;
  }

  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    throw new ApplyPatchError(`Failed to read file to update ${filePath}: ${formatErrorMessage(error)}`, {
      cause: error,
    });
  }
}

async function assertAvailableFilePath(
  filePath: string,
  state: Map<string, string | null>,
  message: string
): Promise<void> {
  const conflictingPath = findConflictingPlannedFilePath(filePath, state);
  if (conflictingPath !== undefined) {
    throw new ApplyPatchError(`${message}; conflicts with planned file ${conflictingPath}`);
  }
  if (state.has(filePath)) {
    if (state.get(filePath) === null) return;
    throw new ApplyPatchError(message);
  }

  try {
    await stat(filePath);
    throw new ApplyPatchError(message);
  } catch (error) {
    if (error instanceof ApplyPatchError) throw error;
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw new ApplyPatchError(`Failed to inspect file ${filePath}: ${formatErrorMessage(error)}`, { cause: error });
  }
}

function findConflictingPlannedFilePath(
  filePath: string,
  state: ReadonlyMap<string, string | null>
): string | undefined {
  for (const [plannedPath, content] of state) {
    if (content === null || plannedPath === filePath) continue;
    if (filePath.startsWith(`${plannedPath}${path.sep}`) || plannedPath.startsWith(`${filePath}${path.sep}`)) {
      return plannedPath;
    }
  }
  return undefined;
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

async function deriveNewContentsFromChunks(
  filePath: string,
  chunks: readonly UpdateFileChunk[],
  state: Map<string, string | null>
): Promise<string> {
  const originalContents = await readExistingFileForUpdate(filePath, state);
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
    throw new ApplyPatchError(`Failed to find expected lines in ${filePath}`);
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
