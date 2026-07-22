import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type TruncationResult,
} from '@earendil-works/pi-coding-agent';

export const TOOL_OUTPUT_LIMIT_DESCRIPTION = `Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} (whichever is hit first). If truncated, the complete output is saved to a temporary file.`;

export interface ToolOutputTruncationDetails {
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

export interface PersistedToolOutput {
  text: string;
  details?: ToolOutputTruncationDetails;
}

export async function limitAndPersistToolOutput(text: string, toolName: string): Promise<PersistedToolOutput> {
  const truncation = truncateHead(text);
  if (!truncation.truncated) return { text };

  const directory = await mkdtemp(path.join(tmpdir(), `pi-${toolName}-`));
  const fullOutputPath = path.join(directory, 'output.txt');
  try {
    await writeFile(fullOutputPath, text, 'utf8');
  } catch (error) {
    await Promise.allSettled([rm(directory, { force: true, recursive: true })]);
    throw error;
  }

  const omittedLines = truncation.totalLines - truncation.outputLines;
  const omittedBytes = truncation.totalBytes - truncation.outputBytes;
  let resultText = truncation.content;
  resultText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
  resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
  resultText += ` ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.`;
  resultText += ` Full output: ${fullOutputPath}]`;

  return { text: resultText, details: { truncation, fullOutputPath } };
}
