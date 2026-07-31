import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

import { getShellConfig } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';

import type { BashCommandConfig } from '#pi-bash-commands/config/schema.js';
import { prependBashCommandsPath, quoteShell } from '#pi-bash-commands/core/shell.js';
import { createCommandShims, createShimScript, type CommandShims } from '#pi-bash-commands/core/shims.js';

let activeShims: CommandShims | undefined;

describe('createShimScript', () => {
  it('quotes fixed values and forwards runtime arguments', () => {
    const script = createShimScript(command({ args: ["fixed's value"], env: { EXAMPLE: "env's value" } }));

    expect(script).toContain(String.raw`EXAMPLE='env'\''s value'`);
    expect(script).toContain(String.raw`'fixed'\''s value' "$@"`);
  });
});

describe('createCommandShims', () => {
  afterEach(async () => {
    await activeShims?.dispose();
    activeShims = undefined;
  });

  it('executes fixed args, runtime args, and configured environment', async () => {
    const script = 'console.log(JSON.stringify({ args: process.argv.slice(1), env: process.env.EXAMPLE }))';
    activeShims = await createCommandShims([
      command({ args: ['-e', script, 'fixed'], env: { EXAMPLE: 'configured' } }),
    ]);

    const result = await spawnShellCommand(
      `${quoteShell(`${activeShims.directory}/example`)} ${quoteShell('runtime value')}`
    );

    expect(result).toEqual({
      code: 0,
      stdout: `${JSON.stringify({ args: ['fixed', 'runtime value'], env: 'configured' })}\n`,
      stderr: '',
    });
  });

  it('removes the private directory on dispose', async () => {
    activeShims = await createCommandShims([command()]);
    const directory = activeShims.directory;

    await activeShims.dispose();
    activeShims = undefined;

    expect(existsSync(directory)).toBe(false);
  });

  it('resolves a shim only after PATH is injected into a bash command', async () => {
    const commandName = 'pi-bash-commands-test-command';
    const script = 'console.log(process.argv[1])';
    activeShims = await createCommandShims([command({ name: commandName, args: ['-e', script] })]);
    const originalPath = process.env.PATH;

    const unavailable = await spawnShellCommand(`command -v ${commandName}`);
    const available = await spawnShellCommand(prependBashCommandsPath(`${commandName} runtime`, activeShims.directory));

    expect(unavailable.code).not.toBe(0);
    expect(available).toEqual({ code: 0, stdout: 'runtime\n', stderr: '' });
    expect(process.env.PATH).toBe(originalPath);
  });

  it('rejects a missing executable before creating shims', async () => {
    await expect(createCommandShims([command({ command: '/missing/pi-bash-commands-executable' })])).rejects.toThrow();
  });

  it('rejects a directory as an executable', async () => {
    await expect(createCommandShims([command({ command: process.cwd() })])).rejects.toThrow('not a file');
  });
});

function command(overrides: Partial<BashCommandConfig> = {}): BashCommandConfig {
  return {
    enabled: true,
    name: 'example',
    command: process.execPath,
    args: [],
    env: {},
    ...overrides,
  };
}

function spawnShellCommand(command: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const shell = getShellConfig();
  if (shell.commandTransport === 'stdin') return spawnCommand(shell.shell, shell.args, command);
  return spawnCommand(shell.shell, [...shell.args, command]);
}

function spawnCommand(
  executable: string,
  args: string[],
  stdin?: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}
