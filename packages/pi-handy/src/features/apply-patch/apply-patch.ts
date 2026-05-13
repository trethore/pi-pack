import { spawn } from 'node:child_process';
import path from 'node:path';
import { withFileMutationQueue } from '@earendil-works/pi-coding-agent';

export interface ApplyPatchResult {
  status: 'completed' | 'failed';
  output: string;
}

interface GitCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

const GIT_APPLY_ARGS = ['apply', '--whitespace=nowarn'] as const;
const GIT_APPLY_CHECK_ARGS = ['apply', '--check', '--whitespace=nowarn'] as const;
const GIT_APPLY_NUMSTAT_ARGS = ['apply', '--numstat', '-z'] as const;

export async function applyPatch(cwd: string, patch: string): Promise<ApplyPatchResult> {
  try {
    if (patch.trim().length === 0) {
      return { status: 'failed', output: 'Error: patch is required' };
    }

    const pathsResult = await runGit([...GIT_APPLY_NUMSTAT_ARGS], cwd, patch);
    if (pathsResult.exitCode !== 0) {
      return { status: 'failed', output: formatGitError('Patch validation failed', pathsResult) };
    }

    const patchPaths = getPatchPaths(patch, pathsResult.stdout).map((patchPath) =>
      resolveWorkspacePath(cwd, patchPath)
    );

    return await withFileMutationQueues(patchPaths, async () => {
      const checkResult = await runGit([...GIT_APPLY_CHECK_ARGS], cwd, patch);
      if (checkResult.exitCode !== 0) {
        return { status: 'failed', output: formatGitError('Patch validation failed', checkResult) };
      }

      const applyResult = await runGit([...GIT_APPLY_ARGS], cwd, patch);
      if (applyResult.exitCode !== 0) {
        return { status: 'failed', output: formatGitError('Patch apply failed', applyResult) };
      }

      return { status: 'completed', output: 'Patch applied' };
    });
  } catch (error) {
    return { status: 'failed', output: formatError(error) };
  }
}

function getPatchPaths(patch: string, numstatOutput: string): string[] {
  return [...new Set([...parsePatchMetadataPaths(patch), ...parseNumstatPaths(numstatOutput)])];
}

function parsePatchMetadataPaths(patch: string): string[] {
  const paths = new Set<string>();
  let inHunk = false;

  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) inHunk = false;
    if (line.startsWith('@@')) inHunk = true;
    if (inHunk) continue;

    const pathFromHeader = parseUnifiedHeaderPath(line);
    if (pathFromHeader) paths.add(pathFromHeader);

    const pathFromRename = parseRenameOrCopyPath(line);
    if (pathFromRename) paths.add(pathFromRename);
  }

  return [...paths];
}

function parseUnifiedHeaderPath(line: string): string | undefined {
  if (!line.startsWith('--- ') && !line.startsWith('+++ ')) return undefined;

  const headerPath = line.slice(4).split('\t')[0]?.trim();
  if (!headerPath || headerPath === '/dev/null') return undefined;
  return stripGitPathPrefix(headerPath);
}

function parseRenameOrCopyPath(line: string): string | undefined {
  for (const prefix of ['rename from ', 'rename to ', 'copy from ', 'copy to ']) {
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }

  return undefined;
}

function stripGitPathPrefix(patchPath: string): string {
  if (patchPath.startsWith('a/') || patchPath.startsWith('b/')) return patchPath.slice(2);
  return patchPath;
}

function parseNumstatPaths(stdout: string): string[] {
  const paths = new Set<string>();

  for (const field of stdout.split('\0')) {
    if (field.length === 0) continue;
    const patchPath = field.split('\t').at(-1);
    if (patchPath) paths.add(patchPath);
  }

  return [...paths];
}

function resolveWorkspacePath(cwd: string, requestedPath: string): string {
  if (path.isAbsolute(requestedPath)) {
    throw new Error(`Invalid patch path '${requestedPath}': absolute paths are not allowed`);
  }

  const workspaceRoot = path.resolve(cwd);
  const targetPath = path.resolve(workspaceRoot, requestedPath);
  const relativePath = path.relative(workspaceRoot, targetPath);

  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid patch path '${requestedPath}': path escapes the workspace`);
  }

  return targetPath;
}

async function withFileMutationQueues<T>(paths: string[], fn: () => Promise<T>): Promise<T> {
  const uniquePaths = getSortedUniquePaths(paths);
  let queued = fn;

  for (let index = uniquePaths.length - 1; index >= 0; index -= 1) {
    const pathToQueue = uniquePaths[index];
    const next = queued;
    queued = () => withFileMutationQueue(pathToQueue, next);
  }

  return await queued();
}

function getSortedUniquePaths(paths: string[]): string[] {
  const sortedPaths: string[] = [];

  for (const pathToInsert of new Set(paths)) {
    const insertionIndex = sortedPaths.findIndex((sortedPath) => pathToInsert < sortedPath);
    if (insertionIndex === -1) {
      sortedPaths.push(pathToInsert);
    } else {
      sortedPaths.splice(insertionIndex, 0, pathToInsert);
    }
  }

  return sortedPaths;
}

async function runGit(args: string[], cwd: string, stdin: string): Promise<GitCommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });

    child.stdin.end(stdin.endsWith('\n') ? stdin : `${stdin}\n`);
  });
}

function formatGitError(prefix: string, result: GitCommandResult): string {
  const details = result.stderr.trim() || result.stdout.trim();
  if (details.length === 0) return `Error: ${prefix}`;
  return `Error: ${prefix}:\n${details}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return `Error: ${error.message}`;
  return 'Error: Unknown apply_patch failure';
}
