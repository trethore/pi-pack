import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { booleanSchema, createConfigMerger } from '@trethore/pi-shared/config/schema.js';

import { getConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  stringArraySchema,
  type LoadedConfig,
  type PartialPiToolmaskConfig,
  type PiToolmaskConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-toolmask';
const { mergeEnabledField, mergeField } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths,
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
}

function cloneDefaultConfig(): PiToolmaskConfig {
  return {
    ...defaultConfig,
    masks: [...defaultConfig.masks],
  };
}

function mergeConfig(
  target: PiToolmaskConfig,
  source: PartialPiToolmaskConfig,
  configPath: string,
  errors: string[]
): void {
  mergeEnabledField(target, source, 'enabled', configPath, errors);
  mergeField(source, 'masks', 'masks', stringArraySchema, configPath, errors, (value) => {
    target.masks = value;
  });
  mergeField(
    source,
    'enforceBeforeAgentStart',
    'enforceBeforeAgentStart',
    booleanSchema,
    configPath,
    errors,
    (value) => {
      target.enforceBeforeAgentStart = value;
    }
  );
  mergeField(source, 'notify', 'notify', booleanSchema, configPath, errors, (value) => {
    target.notify = value;
  });
}
