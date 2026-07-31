import { constants } from 'node:fs';
import { access, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { BashCommandConfig } from '#src/config/schema.js';
import { quoteShell } from '#src/core/shell.js';

export interface CommandShims {
  directory: string;
  dispose(): Promise<void>;
}

export async function createCommandShims(commands: readonly BashCommandConfig[]): Promise<CommandShims> {
  await Promise.all(commands.map((command) => validateExecutable(command.command)));
  const directory = await mkdtemp(path.join(tmpdir(), 'pi-bash-commands-'));
  await writeCommandShims(directory, commands);

  return {
    directory,
    dispose: () => rm(directory, { force: true, recursive: true }),
  };
}

async function writeCommandShims(directory: string, commands: readonly BashCommandConfig[]): Promise<void> {
  const results = await Promise.allSettled(
    commands.map((command) =>
      writeFile(path.join(directory, command.name), createShimScript(command), {
        encoding: 'utf8',
        mode: 0o700,
      })
    )
  );
  const failure = results.find((result) => result.status === 'rejected');
  if (!failure) return;

  await Promise.allSettled([rm(directory, { force: true, recursive: true })]);
  throw failure.reason;
}

async function validateExecutable(command: string): Promise<void> {
  const commandStat = await stat(command);
  if (!commandStat.isFile()) throw new Error(`Command is not a file: ${command}`);
  await access(command, constants.X_OK);
}

export function createShimScript(command: BashCommandConfig): string {
  const assignments = Object.entries(command.env).map(([name, value]) => `${name}=${quoteShell(value)}`);
  const invocation = [
    quoteShell(command.command),
    ...command.args.map((argument) => quoteShell(argument)),
    '"$@"',
  ].join(' ');
  const execution = [...assignments, 'exec', invocation].join(' ');
  return `#!/bin/sh\n${execution}\n`;
}
