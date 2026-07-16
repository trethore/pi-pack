import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { vi } from 'vitest';

interface ConfigTestFileHelpersOptions {
  configFileName: string;
  tempPrefix: string;
}

interface ConfigTestHelpersOptions<TModule> extends ConfigTestFileHelpersOptions {
  importConfig(): Promise<TModule>;
}

export function createConfigTestHelpers<TModule>(options: ConfigTestHelpersOptions<TModule>) {
  return {
    ...createConfigTestFileHelpers(options),
    importConfigWithHome(homeDir: string): Promise<TModule> {
      return importWithHome(homeDir, options.importConfig);
    },
  };
}

export function importWithHome<TModule>(homeDir: string, importModule: () => Promise<TModule>): Promise<TModule> {
  vi.resetModules();
  vi.stubEnv('PI_CODING_AGENT_DIR', path.join(homeDir, '.pi', 'agent'));
  vi.doMock('node:os', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:os')>()),
    homedir: () => homeDir,
  }));

  return importModule();
}

export function resetConfigTestEnvironment(): void {
  vi.unstubAllEnvs();
  vi.doUnmock('node:os');
  vi.resetModules();
}

export function createConfigTestFileHelpers(options: ConfigTestFileHelpersOptions) {
  return {
    makeTempDir(): string {
      return mkdtempSync(path.join(tmpdir(), options.tempPrefix));
    },
    writeGlobalConfig(homeDir: string, contents: string): void {
      writeConfigFile(path.join(homeDir, '.pi', 'agent'), options.configFileName, contents);
    },
    writeProjectConfig(cwd: string, contents: string): void {
      writeConfigFile(path.join(cwd, '.pi'), options.configFileName, contents);
    },
  };
}

function writeConfigFile(configDir: string, configFileName: string, contents: string): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, configFileName), contents);
}
