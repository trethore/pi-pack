import { closeSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DEFAULT_MAX_BYTES = 50 * 1024;
const DEFAULT_MAX_LINES = 2000;

export interface ExecuteCodeOutputDetails {
  truncated?: boolean;
  fullOutputPath?: string;
}

export interface FormattedExecutionOutput {
  text: string;
  details?: ExecuteCodeOutputDetails;
}

export class ExecutionOutputAccumulator {
  private readonly directory = mkdtempSync(path.join(tmpdir(), 'pi-codeact-output-'));
  private readonly fullOutputPath = path.join(this.directory, 'output.txt');
  private readonly fileDescriptor = openSync(this.fullOutputPath, 'w');
  private text = '';
  private truncated = false;
  private closed = false;

  append(output: string): void {
    if (!output) return;

    writeSync(this.fileDescriptor, output, undefined, 'utf8');

    const next = truncateOutput(`${this.text}${output}`);
    this.text = next.text;
    this.truncated ||= next.truncated;
  }

  finish(): FormattedExecutionOutput {
    if (!this.closed) {
      closeSync(this.fileDescriptor);
      this.closed = true;
    }

    if (!this.truncated) {
      rmSync(this.directory, { recursive: true, force: true });
      return { text: this.text || '(no output)' };
    }

    return {
      text: `${this.text}\n\n[Output truncated. Full output: ${this.fullOutputPath}]`,
      details: { truncated: true, fullOutputPath: this.fullOutputPath },
    };
  }
}

function truncateOutput(output: string): { text: string; truncated: boolean } {
  const lineTruncated = truncateOutputLines(output);
  const byteTruncated = truncateOutputBytes(lineTruncated.text);
  return {
    text: byteTruncated.text,
    truncated: lineTruncated.truncated || byteTruncated.truncated,
  };
}

function truncateOutputLines(output: string): { text: string; truncated: boolean } {
  const lines = output.split('\n');
  if (lines.length <= DEFAULT_MAX_LINES) return { text: output, truncated: false };
  return { text: lines.slice(lines.length - DEFAULT_MAX_LINES).join('\n'), truncated: true };
}

function truncateOutputBytes(output: string): { text: string; truncated: boolean } {
  const buffer = Buffer.from(output, 'utf8');
  if (buffer.byteLength <= DEFAULT_MAX_BYTES) return { text: output, truncated: false };
  return { text: buffer.subarray(buffer.byteLength - DEFAULT_MAX_BYTES).toString('utf8'), truncated: true };
}
