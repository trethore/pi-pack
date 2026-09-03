import { createJsoncExtensionConfigLoader } from '@trethore/shared/config/config-file.js';
import { createConfigMerger } from '@trethore/shared/config/schema.js';

import { getWhimsicalConfigPaths } from '#src/config/locations.js';
import { defaultMessages } from '#src/config/messages.js';
import { defaultConfig, messagesSchema, type LoadedConfig, type PiWhimsicalConfig } from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-whimsical';
const { mergeEnabledField, mergeField } = createConfigMerger(EXTENSION_NAME);

export const loadConfig: (cwd: string) => LoadedConfig = createJsoncExtensionConfigLoader<PiWhimsicalConfig>({
  extensionName: EXTENSION_NAME,
  getConfigPaths: getWhimsicalConfigPaths,
  createDefaultConfig: cloneDefaultConfig,
  mergeConfig,
});

function cloneDefaultConfig(): PiWhimsicalConfig {
  return {
    ...defaultConfig,
    messages: [...defaultConfig.messages],
  };
}

function mergeConfig(
  target: PiWhimsicalConfig,
  source: Record<string, unknown>,
  configPath: string,
  errors: string[]
): void {
  mergeEnabledField(target, source, 'enabled', configPath, errors);
  mergeField(source, 'messages', 'messages', messagesSchema, configPath, errors, (value) => {
    target.messages = value ?? [...defaultMessages];
  });
}
