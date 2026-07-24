import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { booleanSchema, createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { getScriptTemplateConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  positiveIntegerSchema,
  surfaceNames,
  type LoadedConfig,
  type PartialPiScriptTemplateConfig,
  type PiScriptTemplateConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-script-template';
const { mergeEnabledField, mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string, options: { includeProject?: boolean } = {}): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths: (configCwd) => getScriptTemplateConfigPaths(configCwd, options),
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
}

function cloneDefaultConfig(): PiScriptTemplateConfig {
  return {
    enabled: defaultConfig.enabled,
    surfaces: { ...defaultConfig.surfaces },
    execution: { ...defaultConfig.execution },
  };
}

function mergeConfig(
  target: PiScriptTemplateConfig,
  source: PartialPiScriptTemplateConfig,
  configPath: string,
  errors: string[]
) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);

  mergeSection(source, 'surfaces', configPath, errors, (section, sectionName) => {
    for (const surfaceName of surfaceNames) {
      mergeField(section, surfaceName, `${sectionName}.${surfaceName}`, booleanSchema, configPath, errors, (value) => {
        target.surfaces[surfaceName] = value;
      });
    }
  });

  mergeSection(source, 'execution', configPath, errors, (section, sectionName) => {
    mergeField(section, 'timeoutMs', `${sectionName}.timeoutMs`, positiveIntegerSchema, configPath, errors, (value) => {
      target.execution.timeoutMs = value;
    });
    mergeField(
      section,
      'maxOutputChars',
      `${sectionName}.maxOutputChars`,
      positiveIntegerSchema,
      configPath,
      errors,
      (value) => {
        target.execution.maxOutputChars = value;
      }
    );
  });
}
