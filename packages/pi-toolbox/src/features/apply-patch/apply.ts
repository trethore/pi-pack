import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hunkDisplayPath, type Hunk, parsePatch, type UpdateFileChunk } from '#src/features/apply-patch/parser.js';
import { seekSequence } from '#src/features/apply-patch/seek-sequence.js';

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

export class ApplyPatchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApplyPatchError';
  }
}

export async function applyPatch(options: ApplyPatchOptions): Promise<ApplyPatchResult> {
  const args = parsePatch(options.patch);
  const effectiveCwd = resolveWorkdir(options.cwd, options.workdir);
  const plannedPatch = await planPatch(args.hunks, effectiveCwd);

  if (plannedPatch.operations.length === 0) {
    throw new ApplyPatchError('No files were modified.');
  }

  await commitPatch(plannedPatch.operations);
  return plannedPatch.summary;
}

function resolveWorkdir(cwd: string, workdir: string | undefined): string {
  const trimmedWorkdir = workdir?.trim();
  if (trimmedWorkdir === undefined || trimmedWorkdir.length === 0) return path.resolve(cwd);
  return path.resolve(cwd, trimmedWorkdir);
}

async function planPatch(hunks: readonly Hunk[], cwd: string): Promise<PlannedPatch> {
  const state = new Map<string, string | null>();
  const operations: PlannedOperation[] = [];
  const summary: ApplyPatchResult = { added: [], modified: [], deleted: [] };

  for (const hunk of hunks) {
    if (hunk.type === 'add') {
      const targetPath = resolvePatchPath(cwd, hunk.path);
      await assertWritableFilePath(targetPath, state);
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
  await assertWritableFilePath(destinationPath, state);
  state.set(destinationPath, newContents);
  if (destinationPath !== targetPath) state.set(targetPath, null);
  operations.push({ type: 'move', sourcePath: targetPath, destinationPath, content: newContents });
}

async function commitPatch(operations: readonly PlannedOperation[]): Promise<void> {
  for (const operation of operations) {
    if (operation.type === 'write') {
      await writeTextFile(operation.path, operation.content);
    } else if (operation.type === 'delete') {
      await unlink(operation.path);
    } else {
      await writeTextFile(operation.destinationPath, operation.content);
      if (operation.sourcePath !== operation.destinationPath) await unlink(operation.sourcePath);
    }
  }
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

async function assertWritableFilePath(filePath: string, state: Map<string, string | null>): Promise<void> {
  if (state.has(filePath)) return;

  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) throw new ApplyPatchError(`Failed to write file ${filePath}: path is a directory`);
  } catch (error) {
    if (error instanceof ApplyPatchError) throw error;
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw new ApplyPatchError(`Failed to inspect file ${filePath}: ${formatErrorMessage(error)}`, { cause: error });
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
    if (chunk.changeContext !== undefined) {
      const contextIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
      if (contextIndex === undefined)
        throw new ApplyPatchError(`Failed to find context '${chunk.changeContext}' in ${filePath}`);
      lineIndex = contextIndex + 1;
    }

    if (chunk.oldLines.length === 0) {
      replacements.push({ startIndex: originalLines.length, oldLength: 0, newLines: [...chunk.newLines] });
      continue;
    }

    let pattern = chunk.oldLines;
    let newLines = chunk.newLines;
    let startIndex = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);

    if (startIndex === undefined && pattern.at(-1) === '') {
      pattern = pattern.slice(0, -1);
      if (newLines.at(-1) === '') newLines = newLines.slice(0, -1);
      startIndex = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
    }

    if (startIndex === undefined) {
      throw new ApplyPatchError(`Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join('\n')}`);
    }

    replacements.push({ startIndex, oldLength: pattern.length, newLines: [...newLines] });
    lineIndex = startIndex + pattern.length;
  }

  return replacements.sort((left, right) => left.startIndex - right.startIndex);
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
