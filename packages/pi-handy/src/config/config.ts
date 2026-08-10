import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger, defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';
import { getHandyConfigPaths } from '#src/config/locations.js';
import { defaultConfig, type LoadedConfig, type PartialPiHandyConfig, type PiHandyConfig } from '#src/config/schema.js';

type EnabledOnlyFeatureConfigKey = Exclude<keyof PiHandyConfig, 'enabled' | 'implementationPrompt'>;

const EXTENSION_NAME = 'pi-handy';
const ENABLED_ONLY_FEATURE_CONFIG_KEYS: EnabledOnlyFeatureConfigKey[] = ['thinkingLevel', 'showSysprompt', 'timeTaken'];
const messageSchema = defineConfigSchema(
  z.string().refine((value) => value.trim().length > 0),
  'expected non-empty string'
);
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
    implementationPrompt: { ...defaultConfig.implementationPrompt },
    thinkingLevel: { ...defaultConfig.thinkingLevel },
    showSysprompt: { ...defaultConfig.showSysprompt },
    timeTaken: { ...defaultConfig.timeTaken },
  };
}

function mergeConfig(target: PiHandyConfig, source: PartialPiHandyConfig, configPath: string, errors: string[]) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);
  mergeSection(source, 'implementationPrompt', configPath, errors, (section, sectionName) => {
    mergeEnabledField(target.implementationPrompt, section, `${sectionName}.enabled`, configPath, errors);
    mergeField(section, 'message', `${sectionName}.message`, messageSchema, configPath, errors, (value) => {
      target.implementationPrompt.message = value;
    });
  });

  for (const key of ENABLED_ONLY_FEATURE_CONFIG_KEYS) {
    mergeSection(source, key, configPath, errors, (section, sectionName) => {
      mergeEnabledField(target[key], section, `${sectionName}.enabled`, configPath, errors);
    });
  }
}
