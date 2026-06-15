import { homedir } from 'node:os';
import path from 'node:path';

import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { getCodeactConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  packageCachePathSchema,
  timeoutSecondsSchema,
  type ExecuteCodeConfig,
  type LoadedConfig,
  type PartialPiCodeactConfig,
  type PiCodeactConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-codeact';
const { mergeEnabledField, mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths: getCodeactConfigPaths,
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig(target, source, configPath, errors) {
      mergeConfig(target, source, configPath, errors, cwd);
    },
  });
}

function cloneDefaultConfig(): PiCodeactConfig {
  return {
    ...defaultConfig,
    executeCode: { ...defaultConfig.executeCode },
  };
}

function mergeConfig(
  target: PiCodeactConfig,
  source: PartialPiCodeactConfig,
  configPath: string,
  errors: string[],
  cwd: string
) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);

  mergeSection(source, 'executeCode', configPath, errors, (section, sectionName) => {
    mergeExecuteCodeConfig(target.executeCode, section, sectionName, configPath, errors, cwd);
  });
}

function mergeExecuteCodeConfig(
  target: ExecuteCodeConfig,
  source: Record<string, unknown>,
  label: string,
  configPath: string,
  errors: string[],
  cwd: string
) {
  mergeEnabledField(target, source, `${label}.enabled`, configPath, errors);
  mergeField(
    source,
    'packageCachePath',
    `${label}.packageCachePath`,
    packageCachePathSchema,
    configPath,
    errors,
    (value) => {
      target.packageCachePath = resolveConfiguredPath(value, cwd);
    }
  );
  mergeField(
    source,
    'defaultTimeoutSeconds',
    `${label}.defaultTimeoutSeconds`,
    timeoutSecondsSchema,
    configPath,
    errors,
    (value) => {
      target.defaultTimeoutSeconds = value;
    }
  );
}

function resolveConfiguredPath(value: string, cwd: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return path.join(homedir(), value.slice(2));
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}
