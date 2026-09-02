import { loadJsoncExtensionConfig } from '@trethore/shared/config/config-file.js';
import { createConfigMerger } from '@trethore/shared/config/schema.js';
import { getHandyConfigPaths } from '#src/config/locations.js';
import { defaultConfig, type LoadedConfig, type PiHandyConfig } from '#src/config/schema.js';

type EnabledFeatureConfigKey = Exclude<keyof PiHandyConfig, 'enabled'>;

const EXTENSION_NAME = 'pi-handy';
const ENABLED_FEATURE_CONFIG_KEYS: EnabledFeatureConfigKey[] = ['showSysprompt', 'timeTaken', 'noWebsocketCacheTtl'];
const { mergeEnabledField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths: getHandyConfigPaths,
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
}

function cloneDefaultConfig(): PiHandyConfig {
  return {
    ...defaultConfig,
    showSysprompt: { ...defaultConfig.showSysprompt },
    timeTaken: { ...defaultConfig.timeTaken },
    noWebsocketCacheTtl: { ...defaultConfig.noWebsocketCacheTtl },
  };
}

function mergeConfig(target: PiHandyConfig, source: Record<string, unknown>, configPath: string, errors: string[]) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);

  for (const key of ENABLED_FEATURE_CONFIG_KEYS) {
    mergeSection(source, key, configPath, errors, (section, sectionName) => {
      mergeEnabledField(target[key], section, `${sectionName}.enabled`, configPath, errors);
    });
  }
}
