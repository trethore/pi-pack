import { readJsoncConfigFile } from '@trethore/pi-shared/config/config-file.js';
import { readBooleanField } from '@trethore/pi-shared/config/field.js';
import { isRecord } from '@trethore/pi-shared/object.js';
import { getConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  type LoadedConfig,
  type PartialPiHandyConfig,
  type PiHandyConfig,
} from '#src/config/schema.js';

type FeatureConfigKey = Exclude<keyof PiHandyConfig, 'enabled'>;

const FEATURE_CONFIG_KEYS: FeatureConfigKey[] = [
  'thinkingLevel',
  'switchWorkspace',
  'showSysprompt',
];

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const config = cloneDefaultConfig();

  for (const configPath of getConfigPaths(cwd)) {
    const parsedConfig = readConfigFile(configPath, errors);
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
  };
}

function readConfigFile(configPath: string, errors: string[]): PartialPiHandyConfig | undefined {
  return readJsoncConfigFile<PartialPiHandyConfig>(configPath, 'pi-handy', errors);
}

function mergeConfig(
  target: PiHandyConfig,
  source: PartialPiHandyConfig,
  configPath: string,
  errors: string[]
) {
  if (source.enabled !== undefined) {
    const enabled = readPiHandyBooleanField(source.enabled, 'enabled', configPath, errors);
    if (enabled !== undefined) target.enabled = enabled;
  }

  for (const key of FEATURE_CONFIG_KEYS) {
    mergeFeatureConfig(target[key], source[key], key, configPath, errors);
  }
}

function mergeFeatureConfig(
  target: { enabled: boolean },
  source: unknown,
  label: string,
  configPath: string,
  errors: string[]
) {
  if (source === undefined) return;

  if (!isRecord(source)) {
    errors.push(
      `pi-handy config ignored invalid ${label} value in ${configPath}; expected object.`
    );
    return;
  }

  if (source.enabled !== undefined) {
    const enabled = readPiHandyBooleanField(source.enabled, `${label}.enabled`, configPath, errors);
    if (enabled !== undefined) target.enabled = enabled;
  }
}

function readPiHandyBooleanField(
  value: unknown,
  label: string,
  configPath: string,
  errors: string[]
): boolean | undefined {
  return readBooleanField(value, 'pi-handy', label, configPath, errors);
}
