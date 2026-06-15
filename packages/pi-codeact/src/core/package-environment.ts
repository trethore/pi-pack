import { access, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { runProcess, type RunProcessResult } from '#src/core/process-runner.js';

export interface PackageEnvironment {
  directory: string;
  packages: string[];
}

export interface EnsurePackageEnvironmentOptions {
  packageCachePath: string;
  packages?: string[];
  signal?: AbortSignal;
  installRunner?: InstallRunner;
}

export type InstallRunner = (options: InstallRunnerOptions) => Promise<RunProcessResult>;

interface InstallRunnerOptions {
  environmentDirectory: string;
  npmCacheDirectory: string;
  packages: string[];
  signal?: AbortSignal;
}

const installLocks = new Map<string, Promise<void>>();

export async function ensurePackageEnvironment(options: EnsurePackageEnvironmentOptions): Promise<PackageEnvironment> {
  const packages = normalizePackages(options.packages);
  const runtimeDirectory = path.join(options.packageCachePath, 'environments', getRuntimeKey());
  const directory = path.join(runtimeDirectory, hashPackages(packages));
  const npmCacheDirectory = path.join(options.packageCachePath, 'npm-cache');
  const markerPath = path.join(directory, '.pi-codeact-installed.json');

  if (await exists(markerPath)) return { directory, packages };

  const lockKey = directory;
  const existingLock = installLocks.get(lockKey);
  if (existingLock) {
    await existingLock;
    return { directory, packages };
  }

  const installPromise = installPackageEnvironment({
    directory,
    npmCacheDirectory,
    markerPath,
    packages,
    signal: options.signal,
    installRunner: options.installRunner ?? runNpmInstall,
  });
  installLocks.set(lockKey, installPromise);

  try {
    await installPromise;
  } finally {
    installLocks.delete(lockKey);
  }

  return { directory, packages };
}

export function normalizePackages(packages: string[] | undefined): string[] {
  if (!packages) return [];

  const normalized = [...new Set(packages.map((packageSpec) => packageSpec.trim()))];
  const emptyPackageIndex = normalized.findIndex((packageSpec) => packageSpec.length === 0);
  if (emptyPackageIndex !== -1) {
    throw new Error(`execute_code failed: packages[${emptyPackageIndex}] must be a non-empty npm package specifier`);
  }

  return normalized.sort((left, right) => left.localeCompare(right));
}

function getRuntimeKey(): string {
  return [
    process.platform,
    process.arch,
    `node${process.versions.node.split('.')[0]}`,
    `abi${process.versions.modules}`,
  ].join('-');
}

async function installPackageEnvironment(options: {
  directory: string;
  npmCacheDirectory: string;
  markerPath: string;
  packages: string[];
  signal?: AbortSignal;
  installRunner: InstallRunner;
}): Promise<void> {
  await mkdir(options.directory, { recursive: true });
  await mkdir(options.npmCacheDirectory, { recursive: true });
  await writeFile(
    path.join(options.directory, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
    'utf8'
  );

  if (options.packages.length > 0) {
    const result = await options.installRunner({
      environmentDirectory: options.directory,
      npmCacheDirectory: options.npmCacheDirectory,
      packages: options.packages,
      signal: options.signal,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        `execute_code failed: npm install exited with code ${result.exitCode}\n\n${result.output}`.trim()
      );
    }
  }

  await writeFile(
    options.markerPath,
    `${JSON.stringify({ packages: options.packages, runtime: getRuntimeKey(), installedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );
}

async function runNpmInstall(options: InstallRunnerOptions): Promise<RunProcessResult> {
  return runProcess({
    command: 'npm',
    args: [
      'install',
      '--prefix',
      options.environmentDirectory,
      '--cache',
      options.npmCacheDirectory,
      '--no-audit',
      '--no-fund',
      ...options.packages,
    ],
    cwd: options.environmentDirectory,
    signal: options.signal,
  });
}

function hashPackages(packages: string[]): string {
  const hash = createHash('sha256').update(JSON.stringify(packages)).digest('hex').slice(0, 32);
  return packages.length === 0 ? `empty-${hash}` : hash;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
