import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger, defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';
import { getHandyConfigPaths } from '#src/config/locations.js';
import { defaultConfig, type LoadedConfig, type PartialPiHandyConfig, type PiHandyConfig } from '#src/config/schema.js';

type EnabledFeatureConfigKey = Exclude<keyof PiHandyConfig, 'enabled' | 'websocketCacheTtl'>;

const EXTENSION_NAME = 'pi-handy';
const ENABLED_FEATURE_CONFIG_KEYS: EnabledFeatureConfigKey[] = ['thinkingLevel', 'showSysprompt', 'timeTaken'];
const ttlMinutesSchema = defineConfigSchema(z.number().int().min(5).max(55), 'expected integer from 5 to 55');
const { mergeEnabledField, mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

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
    thinkingLevel: { ...defaultConfig.thinkingLevel },
    showSysprompt: { ...defaultConfig.showSysprompt },
    timeTaken: { ...defaultConfig.timeTaken },
    websocketCacheTtl: { ...defaultConfig.websocketCacheTtl },
  };
}

function mergeConfig(target: PiHandyConfig, source: PartialPiHandyConfig, configPath: string, errors: string[]) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);

  for (const key of ENABLED_FEATURE_CONFIG_KEYS) {
    mergeSection(source, key, configPath, errors, (section, sectionName) => {
      mergeEnabledField(target[key], section, `${sectionName}.enabled`, configPath, errors);
    });
  }

  mergeSection(source, 'websocketCacheTtl', configPath, errors, (section, sectionName) => {
    mergeEnabledField(target.websocketCacheTtl, section, `${sectionName}.enabled`, configPath, errors);
    mergeField(section, 'ttlMinutes', `${sectionName}.ttlMinutes`, ttlMinutesSchema, configPath, errors, (value) => {
      target.websocketCacheTtl.ttlMinutes = value;
    });
  });
}
