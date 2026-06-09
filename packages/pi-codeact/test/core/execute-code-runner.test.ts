import { access, mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeCode } from '#pi-codeact/core/execute-code-runner.js';
import type { InstallRunner } from '#pi-codeact/core/package-environment.js';

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-codeact-workspace-'));
}

function createPackageCache(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-codeact-package-cache-'));
}

const installDemoPackage: InstallRunner = async (options) => {
  const packageDirectory = path.join(options.environmentDirectory, 'node_modules', 'demo-pkg');
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(path.join(packageDirectory, 'package.json'), '{"type":"module","exports":"./index.js"}\n', 'utf8');
  await writeFile(path.join(packageDirectory, 'index.js'), 'export const value = 7;\n', 'utf8');
  return { exitCode: 0, signal: null, output: '' };
};

describe('executeCode', () => {
  it('runs TypeScript code with top-level await from the workspace cwd', async () => {
    const cwd = createWorkspace();
    const packageCachePath = createPackageCache();

    const result = await executeCode({
      code: 'const value: number = await Promise.resolve(42); console.log(value); console.log(process.cwd());',
      timeoutSeconds: 5,
      packageCachePath,
      cwd,
    });

    expect(result.text).toContain('42');
    expect(result.text).toContain(cwd);
  });

  it('appends stdout and stderr into one output string', async () => {
    const result = await executeCode({
      code: "process.stdout.write('stdout'); process.stderr.write('stderr');",
      timeoutSeconds: 5,
      packageCachePath: createPackageCache(),
      cwd: createWorkspace(),
    });

    expect(result.text).toContain('stdout');
    expect(result.text).toContain('stderr');
    expect(result.text).not.toContain('stdout:');
    expect(result.text).not.toContain('stderr:');
  });

  it('makes requested package environments available to imports', async () => {
    const result = await executeCode({
      code: "import { value } from 'demo-pkg'; console.log(value);",
      packages: ['demo-pkg'],
      timeoutSeconds: 5,
      packageCachePath: createPackageCache(),
      cwd: createWorkspace(),
      installRunner: installDemoPackage,
    });

    expect(result.text).toBe('7\n');
  });

  it('truncates long output and saves the full output', async () => {
    const result = await executeCode({
      code: "console.log('x'.repeat(60 * 1024));",
      timeoutSeconds: 5,
      packageCachePath: createPackageCache(),
      cwd: createWorkspace(),
    });

    expect(result.details?.truncated).toBe(true);
    expect(result.details?.fullOutputPath).toBeDefined();
    expect(result.text).toContain('Output truncated');
    await expect(access(result.details?.fullOutputPath ?? '')).resolves.toBeUndefined();
  });

  it('fails when execution exceeds the timeout', async () => {
    await expect(
      executeCode({
        code: 'setInterval(() => {}, 1000);',
        timeoutSeconds: 1,
        packageCachePath: createPackageCache(),
        cwd: createWorkspace(),
      })
    ).rejects.toThrow('timed out after 1 seconds');
  });
});
