import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { vi } from 'vitest';

const CONFIG_FILE_NAME = 'pi-codexify.jsonc';

export async function importConfigWithHome(homeDir: string) {
  vi.resetModules();
  vi.doMock('node:os', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:os')>()),
    homedir: () => homeDir,
  }));

  return import('#pi-codexify/config/config.js');
}

export function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-codexify-test-'));
}

export function writeGlobalConfig(homeDir: string, contents: string): void {
  writeConfigFile(path.join(homeDir, '.pi', 'agent'), contents);
}

export function writeProjectConfig(cwd: string, contents: string): void {
  writeConfigFile(path.join(cwd, '.pi'), contents);
}

function writeConfigFile(configDir: string, contents: string): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, CONFIG_FILE_NAME), contents);
}
