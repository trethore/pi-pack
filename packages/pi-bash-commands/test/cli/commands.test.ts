import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runPiFindCli } from '#pi-bash-commands/cli/find/index.js';
import { runPiGrepCli } from '#pi-bash-commands/cli/grep/index.js';
import type { CliIo } from '#pi-bash-commands/cli/shared/cli.js';
import { PI_FIND_HELP, PI_GREP_HELP } from '#pi-bash-commands/cli/shared/metadata.js';

const tempDirectories: string[] = [];

describe('search CLIs', () => {
  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
  });

  it.each([
    { run: runPiFindCli, help: PI_FIND_HELP },
    { run: runPiGrepCli, help: PI_GREP_HELP },
  ])('prints the shared help text for --help', async ({ run, help }) => {
    // Arrange
    const output = createOutput();

    // Act
    const code = await run(['--help'], { io: output.io });

    // Assert
    expect(code).toBe(0);
    expect(output.stdout()).toBe(`${help}\n`);
    expect(output.stderr()).toBe('');
  });

  it('finds and formats files with glob filters', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'src'));
    writeFileSync(path.join(cwd, 'src', 'index.ts'), 'export {};');
    writeFileSync(path.join(cwd, 'src', 'index.test.ts'), 'test();');
    writeFileSync(path.join(cwd, 'notes.md'), '# notes');
    const output = createOutput();

    // Act
    const code = await runPiFindCli(['--patterns', '*.ts', '--patterns', '!*.test.ts', '--paths', 'src'], {
      cwd,
      io: output.io,
    });

    // Assert
    expect(code).toBe(0);
    expect(output.stdout()).toBe('found=1\nindex.ts\n');
    expect(output.stderr()).toBe('');
  });

  it('limits file results and reports that more files are available', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'a.txt'), 'a');
    writeFileSync(path.join(cwd, 'b.txt'), 'b');
    const output = createOutput();

    // Act
    const code = await runPiFindCli(['--patterns', '*.txt', '--limit', '1'], { cwd, io: output.io });

    // Assert
    expect(code).toBe(0);
    expect(output.stdout()).toContain('found=1\n');
    expect(output.stdout()).toContain('[more files available]\n');
  });

  it('uses the shorter flat format for wide file trees', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'a'));
    mkdirSync(path.join(cwd, 'b'));
    writeFileSync(path.join(cwd, 'a', 'x.ts'), 'export {};');
    writeFileSync(path.join(cwd, 'b', 'y.ts'), 'export {};');
    const output = createOutput();

    // Act
    const code = await runPiFindCli(['--patterns', '*.ts'], { cwd, io: output.io });

    // Assert
    expect(code).toBe(0);
    expect(output.stdout()).toBe(['found=2', 'a/x.ts', 'b/y.ts', ''].join('\n'));
    expect(output.stderr()).toBe('');
  });

  it('uses the shorter tree format for deeply shared paths', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'src', 'components'), { recursive: true });
    writeFileSync(path.join(cwd, 'src', 'components', 'button.ts'), 'export {};');
    writeFileSync(path.join(cwd, 'src', 'components', 'input.ts'), 'export {};');
    const output = createOutput();

    // Act
    const code = await runPiFindCli(['--patterns', '*.ts'], { cwd, io: output.io });

    // Assert
    expect(code).toBe(0);
    expect(output.stdout()).toBe(['found=2', 'src/components/', '  button.ts', '  input.ts', ''].join('\n'));
    expect(output.stderr()).toBe('');
  });

  it('searches, groups, limits, and clips grep matches', async () => {
    // Arrange
    const cwd = makeTempDir();
    const longMatch = `needle ${'x'.repeat(120)}`;
    writeFileSync(path.join(cwd, 'a.txt'), `${longMatch}\nneedle second\n`);
    writeFileSync(path.join(cwd, 'b.txt'), 'needle third\n');
    const output = createOutput();

    // Act
    const code = await runPiGrepCli(
      ['--regexes', 'needle', '--paths', '.', '--limit', '2', '--limit-per-file', '1', '--max-chars-per-match', '100'],
      { cwd, io: output.io }
    );

    // Assert
    expect(code).toBe(0);
    expect(output.stdout()).toBe(
      [
        'matches=2 files=2',
        'a.txt',
        `1: ${longMatch.slice(0, 100)}`,
        '[more matches in this file]',
        'b.txt',
        '1: needle third',
        '',
      ].join('\n')
    );
    expect(output.stderr()).toBe('');
  });

  it('returns successful empty output for no matches', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'file.txt'), 'haystack\n');
    const output = createOutput();

    // Act
    const code = await runPiGrepCli(['--regexes', 'needle'], { cwd, io: output.io });

    // Assert
    expect(code).toBe(0);
    expect(output.stdout()).toBe('matches=0 files=0\n');
  });

  it('uses exit code 2 for invalid arguments and exit code 1 for runtime failures', async () => {
    // Arrange
    const invalidOutput = createOutput();
    const runtimeOutput = createOutput();

    // Act
    const invalidCode = await runPiGrepCli([], { io: invalidOutput.io });
    const runtimeCode = await runPiFindCli(['--paths', '/missing/pi-find-directory'], {
      io: runtimeOutput.io,
    });

    // Assert
    expect(invalidCode).toBe(2);
    expect(invalidOutput.stderr()).toContain('regexes must contain at least one non-empty string');
    expect(runtimeCode).toBe(1);
    expect(runtimeOutput.stderr()).toContain('search path does not exist');
  });
});

function makeTempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'pi-bash-commands-cli-test-'));
  tempDirectories.push(directory);
  return directory;
}

function createOutput(): { io: CliIo; stdout(): string; stderr(): string } {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: {
        write(value) {
          stdout += value;
        },
      },
      stderr: {
        write(value) {
          stderr += value;
        },
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}
