import { createJsoncExtensionConfigLoader } from '@trethore/shared/config/config-file.js';
import { createConfigMerger } from '@trethore/shared/config/schema.js';
import { getToolboxConfigPaths } from '#src/config/locations.js';
import { defaultConfig, type LoadedConfig, type PiToolboxConfig } from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-toolbox';
const { mergeEnabledField, mergeSection } = createConfigMerger(EXTENSION_NAME);
export const loadConfig: (cwd: string) => LoadedConfig = createJsoncExtensionConfigLoader<PiToolboxConfig>({
  extensionName: EXTENSION_NAME,
  getConfigPaths: getToolboxConfigPaths,
  createDefaultConfig: cloneDefaultConfig,
  mergeConfig,
});

function cloneDefaultConfig(): PiToolboxConfig {
  return {
    ...defaultConfig,
    applyPatch: { ...defaultConfig.applyPatch },
  };
}

function mergeConfig(target: PiToolboxConfig, source: Record<string, unknown>, configPath: string, errors: string[]) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);

  mergeSection(source, 'applyPatch', configPath, errors, (section, sectionName) => {
    mergeEnabledField(target.applyPatch, section, `${sectionName}.enabled`, configPath, errors);
  });
}
