import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { getConfigPaths } from '#src/config/locations.js';
import { defaultConfig, type LoadedConfig, type PartialPiHandyConfig, type PiHandyConfig } from '#src/config/schema.js';

type FeatureConfigKey = Exclude<keyof PiHandyConfig, 'enabled'>;

const EXTENSION_NAME = 'pi-handy';
const FEATURE_CONFIG_KEYS: FeatureConfigKey[] = ['thinkingLevel', 'showSysprompt', 'payloadDump', 'timeTaken'];
const { mergeEnabledField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths,
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
}

function cloneDefaultConfig(): PiHandyConfig {
  return {
    ...defaultConfig,
    thinkingLevel: { ...defaultConfig.thinkingLevel },
    showSysprompt: { ...defaultConfig.showSysprompt },
    payloadDump: { ...defaultConfig.payloadDump },
    timeTaken: { ...defaultConfig.timeTaken },
  };
}

function mergeConfig(target: PiHandyConfig, source: PartialPiHandyConfig, configPath: string, errors: string[]) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);

  for (const key of FEATURE_CONFIG_KEYS) {
    mergeSection(source, key, configPath, errors, (section, sectionName) => {
      mergeEnabledField(target[key], section, `${sectionName}.enabled`, configPath, errors);
    });
  }
}
