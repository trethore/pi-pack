import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { getToolboxConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  limitSchema,
  maxCharsPerMatchSchema,
  type FindFilesToolConfig,
  type GrepToolConfig,
  type LoadedConfig,
  type PartialPiToolboxConfig,
  type PiToolboxConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-toolbox';
const { mergeEnabledField, mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths: getToolboxConfigPaths,
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
}

function cloneDefaultConfig(): PiToolboxConfig {
  return {
    ...defaultConfig,
    applyPatch: { ...defaultConfig.applyPatch },
    findFiles: { ...defaultConfig.findFiles },
    grep: { ...defaultConfig.grep },
  };
}

function mergeConfig(target: PiToolboxConfig, source: PartialPiToolboxConfig, configPath: string, errors: string[]) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);

  mergeSection(source, 'applyPatch', configPath, errors, (section, sectionName) => {
    mergeEnabledField(target.applyPatch, section, `${sectionName}.enabled`, configPath, errors);
  });

  mergeSection(source, 'findFiles', configPath, errors, (section, sectionName) => {
    mergeFindFilesConfig(target.findFiles, section, sectionName, configPath, errors);
  });

  mergeSection(source, 'grep', configPath, errors, (section, sectionName) => {
    mergeGrepConfig(target.grep, section, sectionName, configPath, errors);
  });
}

function mergeFindFilesConfig(
  target: FindFilesToolConfig,
  source: Record<string, unknown>,
  label: string,
  configPath: string,
  errors: string[]
) {
  mergeLimitedToolConfig(target, source, label, configPath, errors);
}

function mergeGrepConfig(
  target: GrepToolConfig,
  source: Record<string, unknown>,
  label: string,
  configPath: string,
  errors: string[]
) {
  mergeLimitedToolConfig(target, source, label, configPath, errors);
  mergeField(
    source,
    'defaultLimitPerFile',
    `${label}.defaultLimitPerFile`,
    limitSchema,
    configPath,
    errors,
    (value) => {
      target.defaultLimitPerFile = value;
    }
  );
  mergeField(
    source,
    'defaultMaxCharsPerMatch',
    `${label}.defaultMaxCharsPerMatch`,
    maxCharsPerMatchSchema,
    configPath,
    errors,
    (value) => {
      target.defaultMaxCharsPerMatch = value;
    }
  );
}

function mergeLimitedToolConfig(
  target: { enabled?: boolean; defaultLimit: number },
  source: Record<string, unknown>,
  label: string,
  configPath: string,
  errors: string[]
) {
  mergeEnabledField(target, source, `${label}.enabled`, configPath, errors);
  mergeField(source, 'defaultLimit', `${label}.defaultLimit`, limitSchema, configPath, errors, (value) => {
    target.defaultLimit = value;
  });
}
