import { readJsoncConfigFile } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { getConfigPaths } from '#src/config/locations.js';
import {
  codexReasoningSummarySchema,
  codexVerbositySchema,
  defaultConfig,
  enabledSchema,
  type LoadedConfig,
  type PartialPiCodexifyConfig,
  type PiCodexifyConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-codexify';
const { mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const config = cloneDefaultConfig();

  for (const configPath of getConfigPaths(cwd)) {
    const parsedConfig = readJsoncConfigFile<PartialPiCodexifyConfig>(
      configPath,
      EXTENSION_NAME,
      errors
    );
    if (parsedConfig) mergeConfig(config, parsedConfig, configPath, errors);
  }

  return { config, errors };
}

function cloneDefaultConfig(): PiCodexifyConfig {
  return {
    ...defaultConfig,
    codex: { ...defaultConfig.codex },
    usage: { ...defaultConfig.usage },
    account: { ...defaultConfig.account },
    webSearch: { ...defaultConfig.webSearch },
  };
}

function mergeConfig(
  target: PiCodexifyConfig,
  source: PartialPiCodexifyConfig,
  configPath: string,
  errors: string[]
) {
  mergeField(source, 'enabled', 'enabled', enabledSchema, configPath, errors, (value) => {
    target.enabled = value;
  });

  mergeSection(source, 'codex', configPath, errors, (section, sectionName) => {
    mergeCodexFields(target, section, sectionName, configPath, errors);
  });
  mergeSection(source, 'usage', configPath, errors, (section, sectionName) => {
    mergeEnabledSection(target.usage, section, sectionName, configPath, errors);
  });
  mergeSection(source, 'account', configPath, errors, (section, sectionName) => {
    mergeEnabledSection(target.account, section, sectionName, configPath, errors);
  });
  mergeSection(source, 'webSearch', configPath, errors, (section, sectionName) => {
    mergeEnabledSection(target.webSearch, section, sectionName, configPath, errors);
  });
}

function mergeCodexFields(
  target: PiCodexifyConfig,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeEnabledSection(target.codex, source, configName, configPath, errors);
  mergeField(
    source,
    'verbosity',
    `${configName}.verbosity`,
    codexVerbositySchema,
    configPath,
    errors,
    (value) => {
      target.codex.verbosity = value ?? undefined;
    }
  );
  mergeField(
    source,
    'reasoningSummary',
    `${configName}.reasoningSummary`,
    codexReasoningSummarySchema,
    configPath,
    errors,
    (value) => {
      target.codex.reasoningSummary = value ?? undefined;
    }
  );
}

function mergeEnabledSection(
  target: { enabled: boolean },
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeField(
    source,
    'enabled',
    `${configName}.enabled`,
    enabledSchema,
    configPath,
    errors,
    (value) => {
      target.enabled = value;
    }
  );
}
