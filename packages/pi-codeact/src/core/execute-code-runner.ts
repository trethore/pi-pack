import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { ensurePackageEnvironment, type InstallRunner } from '#src/core/package-environment.js';
import type { ExecuteCodeOutputDetails } from '#src/core/output.js';
import { ProcessAbortedError, ProcessTimeoutError, runProcess } from '#src/core/process-runner.js';

export interface ExecuteCodeRunnerOptions {
  code: string;
  packages?: string[];
  timeoutSeconds: number;
  packageCachePath: string;
  cwd: string;
  signal?: AbortSignal;
  installRunner?: InstallRunner;
}

export interface ExecuteCodeRunnerResult {
  text: string;
  details?: ExecuteCodeOutputDetails;
}

export async function executeCode(options: ExecuteCodeRunnerOptions): Promise<ExecuteCodeRunnerResult> {
  const packageEnvironment = await ensurePackageEnvironment({
    packageCachePath: options.packageCachePath,
    packages: options.packages,
    signal: options.signal,
    installRunner: options.installRunner,
  });
  const runDirectory = path.join(packageEnvironment.directory, 'runs', randomUUID());
  const scriptPath = path.join(runDirectory, 'main.ts');

  await mkdir(runDirectory, { recursive: true });
  await writeFile(scriptPath, `${options.code}\n`, 'utf8');

  try {
    const result = await runProcess({
      command: process.execPath,
      args: [scriptPath],
      cwd: options.cwd,
      timeoutSeconds: options.timeoutSeconds,
      signal: options.signal,
    });

    if (result.exitCode !== 0) {
      throw new Error(appendStatus(result.output, `execute_code failed: process exited with code ${result.exitCode}`));
    }
    if (result.signal) {
      throw new Error(
        appendStatus(result.output, `execute_code failed: process terminated by signal ${result.signal}`)
      );
    }

    return { text: result.output, details: result.details };
  } catch (error) {
    if (error instanceof ProcessTimeoutError) {
      throw new Error(
        appendStatus(error.output, `execute_code failed: timed out after ${error.timeoutSeconds} seconds`)
      );
    }
    if (error instanceof ProcessAbortedError) {
      throw new Error(appendStatus(error.output, 'execute_code failed: aborted'));
    }
    throw error;
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
}

function appendStatus(text: string, status: string): string {
  return `${text ? `${text}\n\n` : ''}${status}`;
}
