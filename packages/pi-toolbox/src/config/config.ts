import { readJsoncConfigFile } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { getConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  enabledSchema,
  limitSchema,
  maxCharsPerMatchSchema,
  type GlobToolConfig,
  type GrepToolConfig,
  type LoadedConfig,
  type PartialPiToolboxConfig,
  type PiToolboxConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-toolbox';
const { mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const config = cloneDefaultConfig();

  for (const configPath of getConfigPaths(cwd)) {
    const parsedConfig = readJsoncConfigFile<PartialPiToolboxConfig>(
      configPath,
      EXTENSION_NAME,
      errors
    );
    if (parsedConfig) mergeConfig(config, parsedConfig, configPath, errors);
  }

  return { config, errors };
}

function cloneDefaultConfig(): PiToolboxConfig {
  return {
    ...defaultConfig,
    glob: { ...defaultConfig.glob },
    grep: { ...defaultConfig.grep },
  };
}

function mergeConfig(
  target: PiToolboxConfig,
  source: PartialPiToolboxConfig,
  configPath: string,
  errors: string[]
) {
  mergeField(source, 'enabled', 'enabled', enabledSchema, configPath, errors, (value) => {
    target.enabled = value;
  });

  mergeSection(source, 'glob', configPath, errors, (section, sectionName) => {
    mergeGlobConfig(target.glob, section, sectionName, configPath, errors);
  });

  mergeSection(source, 'grep', configPath, errors, (section, sectionName) => {
    mergeGrepConfig(target.grep, section, sectionName, configPath, errors);
  });
}

function mergeGlobConfig(
  target: GlobToolConfig,
  source: Record<string, unknown>,
  label: string,
  configPath: string,
  errors: string[]
) {
  mergeToolEnabled(target, source, label, configPath, errors);
  mergeDefaultLimit(target, source, label, configPath, errors);
}

function mergeGrepConfig(
  target: GrepToolConfig,
  source: Record<string, unknown>,
  label: string,
  configPath: string,
  errors: string[]
) {
  mergeToolEnabled(target, source, label, configPath, errors);
  mergeDefaultLimit(target, source, label, configPath, errors);
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

function mergeToolEnabled(
  target: { enabled: boolean },
  source: Record<string, unknown>,
  label: string,
  configPath: string,
  errors: string[]
) {
  mergeField(source, 'enabled', `${label}.enabled`, enabledSchema, configPath, errors, (value) => {
    target.enabled = value;
  });
}

function mergeDefaultLimit(
  target: { defaultLimit: number },
  source: Record<string, unknown>,
  label: string,
  configPath: string,
  errors: string[]
) {
  mergeField(
    source,
    'defaultLimit',
    `${label}.defaultLimit`,
    limitSchema,
    configPath,
    errors,
    (value) => {
      target.defaultLimit = value;
    }
  );
}
