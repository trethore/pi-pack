import { loadJsoncExtensionConfig } from '@trethore/shared/config/config-file.js';
import { booleanSchema, createConfigMerger } from '@trethore/shared/config/schema.js';

import { getNotifyConfigPaths } from '#src/config/locations.js';
import {
  cooldownSchema,
  defaultConfig,
  messageSchema,
  notificationProtocolSchema,
  type LoadedConfig,
  type PiNotifyConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-notify';
const { mergeEnabledField, mergeField } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string, options: { includeProject?: boolean } = {}): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths: (configCwd) => getNotifyConfigPaths(configCwd, options.includeProject),
    createDefaultConfig: () => ({ ...defaultConfig }),
    mergeConfig,
  });
}

function mergeConfig(
  target: PiNotifyConfig,
  source: Record<string, unknown>,
  configPath: string,
  errors: string[]
): void {
  mergeEnabledField(target, source, 'enabled', configPath, errors);
  mergeField(source, 'message', 'message', messageSchema, configPath, errors, (value) => {
    target.message = value;
  });
  mergeField(source, 'cooldown', 'cooldown', cooldownSchema, configPath, errors, (value) => {
    target.cooldown = value;
  });
  mergeField(source, 'unfocusedOnly', 'unfocusedOnly', booleanSchema, configPath, errors, (value) => {
    target.unfocusedOnly = value;
  });
  mergeField(source, 'protocol', 'protocol', notificationProtocolSchema, configPath, errors, (value) => {
    target.protocol = value;
  });
}
