import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
  withFileMutationQueue,
  type Theme,
  type TruncationResult,
} from '@earendil-works/pi-coding-agent';

import type { RunEvalResult } from '#src/features/eval/runner.js';
import type { EvalParameters } from '#src/features/eval/types.js';

export interface FormattedEvalResult {
  text: string;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

export async function formatEvalResult(
  result: RunEvalResult,
  timeoutMs: number
): Promise<FormattedEvalResult> {
  const truncation = truncateTail(result.output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  const fullOutputPath = truncation.truncated ? await writeFullOutput(result.output) : undefined;
  const outputText = formatEvalOutput(result.output, truncation, fullOutputPath);
  const status = formatEvalStatus(result, timeoutMs);
  const text = outputText ? `${outputText}\n\n${status}` : status;

  return {
    text,
    truncation: truncation.truncated ? truncation : undefined,
    fullOutputPath,
  };
}

export function formatEvalCall(args: EvalParameters | undefined, theme: Theme): string {
  const language = args?.language ?? '...';
  const timeout =
    args?.timeoutMs === undefined ? '' : theme.fg('muted', ` (timeout ${args.timeoutMs}ms)`);
  const cwd = args?.cwd === undefined ? '' : theme.fg('toolOutput', ` in ${args.cwd}`);
  return theme.fg('toolTitle', theme.bold(`eval ${language}`)) + cwd + timeout;
}

function formatEvalOutput(
  output: string,
  truncation: TruncationResult,
  fullOutputPath: string | undefined
): string {
  if (!truncation.truncated) return output.trimEnd();

  return `${truncation.content.trimEnd()}\n\n${formatTruncationFooter(output, truncation, fullOutputPath)}`;
}

function formatTruncationFooter(
  output: string,
  truncation: TruncationResult,
  fullOutputPath: string | undefined
): string {
  const startLine = truncation.totalLines - truncation.outputLines + 1;
  const endLine = truncation.totalLines;
  const location = fullOutputPath ? ` Full output: ${fullOutputPath}` : '';

  if (truncation.lastLinePartial) {
    return `[Showing last ${formatSize(truncation.outputBytes)} of output (${formatSize(Buffer.byteLength(output, 'utf8'))} total).${location}]`;
  }

  if (truncation.truncatedBy === 'lines') {
    return `[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}.${location}]`;
  }

  return `[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit).${location}]`;
}

function formatEvalStatus(result: RunEvalResult, timeoutMs: number): string {
  const duration = `duration=${Math.round(result.durationMs)}ms`;
  if (result.timedOut) {
    const exitCode = result.exitCode === null ? '' : `, exitCode=${result.exitCode}`;
    return `[timed out after ${timeoutMs}ms${exitCode}, ${duration}]`;
  }

  return `[exitCode=${result.exitCode ?? 'null'}, ${duration}]`;
}

async function writeFullOutput(output: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'pi-eval-'));
  const filePath = path.join(tempDir, 'output.txt');
  await withFileMutationQueue(filePath, async () => {
    await writeFile(filePath, output, 'utf8');
  });
  return filePath;
}
