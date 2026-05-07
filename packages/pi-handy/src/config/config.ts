import { readJsoncConfigFile } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { getConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  enabledSchema,
  type LoadedConfig,
  type PartialPiHandyConfig,
  type PiHandyConfig,
} from '#src/config/schema.js';

type FeatureConfigKey = Exclude<keyof PiHandyConfig, 'enabled'>;

const EXTENSION_NAME = 'pi-handy';
const FEATURE_CONFIG_KEYS: FeatureConfigKey[] = [
  'thinkingLevel',
  'switchWorkspace',
  'showSysprompt',
  'updatePi',
];
const { mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const config = cloneDefaultConfig();

  for (const configPath of getConfigPaths(cwd)) {
    const parsedConfig = readJsoncConfigFile<PartialPiHandyConfig>(
      configPath,
      EXTENSION_NAME,
      errors
    );
    if (parsedConfig) mergeConfig(config, parsedConfig, configPath, errors);
  }

  return { config, errors };
}

function cloneDefaultConfig(): PiHandyConfig {
  return {
    ...defaultConfig,
    thinkingLevel: { ...defaultConfig.thinkingLevel },
    switchWorkspace: { ...defaultConfig.switchWorkspace },
    showSysprompt: { ...defaultConfig.showSysprompt },
    updatePi: { ...defaultConfig.updatePi },
  };
}

function mergeConfig(
  target: PiHandyConfig,
  source: PartialPiHandyConfig,
  configPath: string,
  errors: string[]
) {
  mergeField(source, 'enabled', 'enabled', enabledSchema, configPath, errors, (value) => {
    target.enabled = value;
  });

  for (const key of FEATURE_CONFIG_KEYS) {
    mergeSection(source, key, configPath, errors, (section, sectionName) => {
      mergeFeatureConfig(target[key], section, sectionName, configPath, errors);
    });
  }
}

function mergeFeatureConfig(
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
