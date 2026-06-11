const BEGIN_PATCH_MARKER = '*** Begin Patch';
const ENVIRONMENT_ID_MARKER = '*** Environment ID: ';
const END_PATCH_MARKER = '*** End Patch';
const ADD_FILE_MARKER = '*** Add File: ';
const DELETE_FILE_MARKER = '*** Delete File: ';
const UPDATE_FILE_MARKER = '*** Update File: ';
const MOVE_TO_MARKER = '*** Move to: ';
const EOF_MARKER = '*** End of File';
const CHANGE_CONTEXT_MARKER = '@@ ';
const EMPTY_CHANGE_CONTEXT_MARKER = '@@';

export type PatchParseError = InvalidPatchError | InvalidHunkError;

export class InvalidPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPatchError';
  }
}

export class InvalidHunkError extends Error {
  constructor(
    message: string,
    readonly lineNumber: number
  ) {
    super(message);
    this.name = 'InvalidHunkError';
  }
}

export type Hunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk;

export interface AddFileHunk {
  type: 'add';
  path: string;
  contents: string;
}

export interface DeleteFileHunk {
  type: 'delete';
  path: string;
}

export interface UpdateFileHunk {
  type: 'update';
  path: string;
  movePath?: string;
  chunks: UpdateFileChunk[];
}

export interface UpdateFileChunk {
  changeContext?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
}

export interface ApplyPatchArgs {
  patch: string;
  hunks: Hunk[];
  environmentId?: string;
}

export function parsePatch(patch: string): ApplyPatchArgs {
  const lines = splitPatchLines(patch.trim());
  const { patchLines, hunkLines } = checkPatchBoundariesLenient(lines);
  const preamble = parseEnvironmentIdPreamble(hunkLines);
  let remainingLines = preamble.remainingLines;
  let lineNumber = preamble.lineNumber;
  const hunks: Hunk[] = [];

  while (remainingLines.length > 0) {
    const parsed = parseOneHunk(remainingLines, lineNumber);
    hunks.push(parsed.hunk);
    lineNumber += parsed.parsedLines;
    remainingLines = remainingLines.slice(parsed.parsedLines);
  }

  return {
    patch: patchLines.join('\n'),
    hunks,
    environmentId: preamble.environmentId,
  };
}

export function formatPatchParseError(error: PatchParseError): string {
  if (error instanceof InvalidPatchError) return `Invalid patch: ${error.message}`;
  return `Invalid patch hunk on line ${error.lineNumber}: ${error.message}`;
}

export function hunkDisplayPath(hunk: Hunk): string {
  if (hunk.type === 'update') return hunk.movePath ?? hunk.path;
  return hunk.path;
}

function splitPatchLines(patch: string): string[] {
  return patch.length === 0 ? [] : patch.split(/\r?\n/);
}

function parseEnvironmentIdPreamble(hunkLines: string[]): {
  environmentId?: string;
  remainingLines: string[];
  lineNumber: number;
} {
  const firstLine = hunkLines[0];
  const environmentId = firstLine?.trimStart().startsWith(ENVIRONMENT_ID_MARKER)
    ? firstLine.trimStart().slice(ENVIRONMENT_ID_MARKER.length).trim()
    : undefined;

  if (environmentId === undefined) {
    return { remainingLines: hunkLines, lineNumber: 2 };
  }

  if (environmentId.length === 0) {
    throw new InvalidPatchError('apply_patch environment_id cannot be empty');
  }

  return { environmentId, remainingLines: hunkLines.slice(1), lineNumber: 3 };
}

function checkPatchBoundariesLenient(originalLines: string[]): { patchLines: string[]; hunkLines: string[] } {
  try {
    return checkPatchBoundariesStrict(originalLines);
  } catch (error) {
    if (!(error instanceof InvalidPatchError)) throw error;
    const first = originalLines[0];
    const last = originalLines.at(-1);
    if (
      originalLines.length >= 4 &&
      (first === '<<EOF' || first === "<<'EOF'" || first === '<<"EOF"') &&
      last?.endsWith('EOF') === true
    ) {
      return checkPatchBoundariesStrict(originalLines.slice(1, -1));
    }
    throw error;
  }
}

function checkPatchBoundariesStrict(lines: string[]): { patchLines: string[]; hunkLines: string[] } {
  const first = lines[0]?.trim();
  const last = lines.at(-1)?.trim();

  if (first === BEGIN_PATCH_MARKER && last === END_PATCH_MARKER) {
    return { patchLines: lines, hunkLines: lines.slice(1, -1) };
  }

  if (first !== BEGIN_PATCH_MARKER) {
    throw new InvalidPatchError("The first line of the patch must be '*** Begin Patch'");
  }

  throw new InvalidPatchError("The last line of the patch must be '*** End Patch'");
}

function parseOneHunk(lines: string[], lineNumber: number): { hunk: Hunk; parsedLines: number } {
  const firstLine = lines[0]?.trim() ?? '';
  const addPath = stripMarker(firstLine, ADD_FILE_MARKER);
  if (addPath !== undefined) return parseAddFileHunk(lines, addPath);

  const deletePath = stripMarker(firstLine, DELETE_FILE_MARKER);
  if (deletePath !== undefined) return { hunk: { type: 'delete', path: deletePath }, parsedLines: 1 };

  const updatePath = stripMarker(firstLine, UPDATE_FILE_MARKER);
  if (updatePath !== undefined) return parseUpdateFileHunk(lines, updatePath, lineNumber);

  throw new InvalidHunkError(
    `'${firstLine}' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`,
    lineNumber
  );
}

function parseAddFileHunk(lines: string[], filePath: string): { hunk: Hunk; parsedLines: number } {
  let contents = '';
  let parsedLines = 1;

  for (const addLine of lines.slice(1)) {
    if (!addLine.startsWith('+')) break;
    contents += `${addLine.slice(1)}\n`;
    parsedLines += 1;
  }

  return { hunk: { type: 'add', path: filePath, contents }, parsedLines };
}

function parseUpdateFileHunk(
  lines: string[],
  filePath: string,
  lineNumber: number
): { hunk: Hunk; parsedLines: number } {
  let remainingLines = lines.slice(1);
  let parsedLines = 1;
  const movePath = stripMarker(remainingLines[0], MOVE_TO_MARKER);

  if (movePath !== undefined) {
    remainingLines = remainingLines.slice(1);
    parsedLines += 1;
  }

  const chunks: UpdateFileChunk[] = [];
  while (remainingLines.length > 0) {
    const firstLine = remainingLines[0];
    if (firstLine === undefined) break;
    if (firstLine.trim().length === 0) {
      parsedLines += 1;
      remainingLines = remainingLines.slice(1);
      continue;
    }
    if (firstLine.startsWith('*')) break;

    const parsed = parseUpdateFileChunk(remainingLines, lineNumber + parsedLines, chunks.length === 0);
    chunks.push(parsed.chunk);
    parsedLines += parsed.parsedLines;
    remainingLines = remainingLines.slice(parsed.parsedLines);
  }

  if (chunks.length === 0) {
    throw new InvalidHunkError(`Update file hunk for path '${filePath}' is empty`, lineNumber);
  }

  return { hunk: { type: 'update', path: filePath, movePath, chunks }, parsedLines };
}

function parseUpdateFileChunk(
  lines: string[],
  lineNumber: number,
  allowMissingContext: boolean
): { chunk: UpdateFileChunk; parsedLines: number } {
  if (lines.length === 0) {
    throw new InvalidHunkError('Update hunk does not contain any lines', lineNumber);
  }

  const context = parseChangeContext(lines[0] ?? '', lineNumber, allowMissingContext);
  if (context.startIndex >= lines.length) {
    throw new InvalidHunkError('Update hunk does not contain any lines', lineNumber + 1);
  }

  const chunk: UpdateFileChunk = {
    oldLines: [],
    newLines: [],
    isEndOfFile: false,
  };
  if (context.changeContext !== undefined) chunk.changeContext = context.changeContext;

  let parsedLines = 0;
  for (const lineContents of lines.slice(context.startIndex)) {
    const action = applyUpdateChunkLine(chunk, lineContents, parsedLines, lineNumber);
    if (action.parsed) parsedLines += 1;
    if (action.stop) break;
  }

  return { chunk, parsedLines: parsedLines + context.startIndex };
}

function applyUpdateChunkLine(
  chunk: UpdateFileChunk,
  lineContents: string,
  parsedLines: number,
  lineNumber: number
): { parsed: boolean; stop: boolean } {
  if (lineContents === EOF_MARKER) {
    if (parsedLines === 0) {
      throw new InvalidHunkError('Update hunk does not contain any lines', lineNumber + 1);
    }
    chunk.isEndOfFile = true;
    return { parsed: true, stop: true };
  }

  switch (lineContents[0]) {
    case undefined: {
      chunk.oldLines.push('');
      chunk.newLines.push('');
      return { parsed: true, stop: false };
    }
    case ' ': {
      chunk.oldLines.push(lineContents.slice(1));
      chunk.newLines.push(lineContents.slice(1));
      return { parsed: true, stop: false };
    }
    case '+': {
      chunk.newLines.push(lineContents.slice(1));
      return { parsed: true, stop: false };
    }
    case '-': {
      chunk.oldLines.push(lineContents.slice(1));
      return { parsed: true, stop: false };
    }
    default: {
      if (parsedLines === 0) {
        throw new InvalidHunkError(
          `Unexpected line found in update hunk: '${lineContents}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`,
          lineNumber + 1
        );
      }
      return { parsed: false, stop: true };
    }
  }
}

function parseChangeContext(
  line: string,
  lineNumber: number,
  allowMissingContext: boolean
): { changeContext?: string; startIndex: number } {
  if (line === EMPTY_CHANGE_CONTEXT_MARKER) return { startIndex: 1 };
  if (line.startsWith(CHANGE_CONTEXT_MARKER))
    return { changeContext: line.slice(CHANGE_CONTEXT_MARKER.length), startIndex: 1 };
  if (allowMissingContext) return { startIndex: 0 };
  throw new InvalidHunkError(`Expected update hunk to start with a @@ context marker, got: '${line}'`, lineNumber);
}

function stripMarker(line: string | undefined, marker: string): string | undefined {
  return line?.startsWith(marker) === true ? line.slice(marker.length) : undefined;
}
