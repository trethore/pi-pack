import { access, readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ensurePackageEnvironment,
  normalizePackages,
  type InstallRunner,
} from '#pi-codeact/core/package-environment.js';

describe('normalizePackages', () => {
  it('trims, deduplicates, and sorts package specifiers', () => {
    expect(normalizePackages([' zod ', 'yaml@2', 'zod'])).toEqual(['yaml@2', 'zod']);
  });

  it('rejects empty package specifiers', () => {
    expect(() => normalizePackages(['zod', ' '])).toThrow('must be a non-empty npm package specifier');
  });
});

describe('ensurePackageEnvironment', () => {
  it('creates an empty package environment without running npm install', async () => {
    const packageCachePath = mkdtempSync(path.join(tmpdir(), 'pi-codeact-package-cache-'));
    let installCalls = 0;

    const environment = await ensurePackageEnvironment({
      packageCachePath,
      installRunner: async () => {
        installCalls += 1;
        return { exitCode: 0, signal: null, output: '' };
      },
    });

    await expect(access(path.join(environment.directory, 'package.json'))).resolves.toBeUndefined();
    expect(installCalls).toBe(0);
  });

  it('runs npm install once for the same package set', async () => {
    const packageCachePath = mkdtempSync(path.join(tmpdir(), 'pi-codeact-package-cache-'));
    const installOptions: Array<{ environmentDirectory: string; npmCacheDirectory: string; packages: string[] }> = [];
    const installRunner: InstallRunner = async (options) => {
      installOptions.push({
        environmentDirectory: options.environmentDirectory,
        npmCacheDirectory: options.npmCacheDirectory,
        packages: options.packages,
      });
      return { exitCode: 0, signal: null, output: '' };
    };

    const firstEnvironment = await ensurePackageEnvironment({
      packageCachePath,
      packages: ['zod', ' yaml@2 ', 'zod'],
      installRunner,
    });
    const secondEnvironment = await ensurePackageEnvironment({
      packageCachePath,
      packages: ['yaml@2', 'zod'],
      installRunner,
    });

    const packageJson = JSON.parse(await readFile(path.join(firstEnvironment.directory, 'package.json'), 'utf8')) as {
      type: string;
    };
    expect(firstEnvironment.directory).toBe(secondEnvironment.directory);
    expect(packageJson.type).toBe('module');
    expect(installOptions).toEqual([
      {
        environmentDirectory: firstEnvironment.directory,
        npmCacheDirectory: path.join(packageCachePath, 'npm-cache'),
        packages: ['yaml@2', 'zod'],
      },
    ]);
  });
});
