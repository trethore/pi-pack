import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { getCodexifyConfigPaths } from '#src/config/locations.js';
import {
  codexReasoningSummarySchema,
  codexVerbositySchema,
  defaultConfig,
  type LoadedConfig,
  type PartialPiCodexifyConfig,
  type PiCodexifyConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-codexify';
const { mergeEnabledField, mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths: getCodexifyConfigPaths,
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
}

function cloneDefaultConfig(): PiCodexifyConfig {
  return {
    ...defaultConfig,
    codex: { ...defaultConfig.codex },
    usage: { ...defaultConfig.usage },
    account: { ...defaultConfig.account },
    reset: { ...defaultConfig.reset },
    webSearch: { ...defaultConfig.webSearch },
  };
}

function mergeConfig(target: PiCodexifyConfig, source: PartialPiCodexifyConfig, configPath: string, errors: string[]) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);

  mergeSection(source, 'codex', configPath, errors, (section, sectionName) => {
    mergeCodexFields(target, section, sectionName, configPath, errors);
  });
  mergeSection(source, 'usage', configPath, errors, (section, sectionName) => {
    mergeEnabledField(target.usage, section, `${sectionName}.enabled`, configPath, errors);
  });
  mergeSection(source, 'account', configPath, errors, (section, sectionName) => {
    mergeEnabledField(target.account, section, `${sectionName}.enabled`, configPath, errors);
  });
  mergeSection(source, 'reset', configPath, errors, (section, sectionName) => {
    mergeEnabledField(target.reset, section, `${sectionName}.enabled`, configPath, errors);
  });
  mergeSection(source, 'webSearch', configPath, errors, (section, sectionName) => {
    mergeEnabledField(target.webSearch, section, `${sectionName}.enabled`, configPath, errors);
  });
}

function mergeCodexFields(
  target: PiCodexifyConfig,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeEnabledField(target.codex, source, `${configName}.enabled`, configPath, errors);
  mergeField(source, 'verbosity', `${configName}.verbosity`, codexVerbositySchema, configPath, errors, (value) => {
    target.codex.verbosity = value ?? undefined;
  });
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
