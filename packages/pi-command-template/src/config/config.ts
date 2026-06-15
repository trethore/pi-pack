import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { booleanSchema, createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { getCommandTemplateConfigPaths } from '#src/config/locations.js';
import {
  cwdSchema,
  defaultConfig,
  positiveIntegerSchema,
  surfaceNames,
  templatesSchema,
  type LoadedConfig,
  type PartialPiCommandTemplateConfig,
  type PiCommandTemplateConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-command-template';
const { mergeEnabledField, mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths: getCommandTemplateConfigPaths,
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
}

function cloneDefaultConfig(): PiCommandTemplateConfig {
  return {
    enabled: defaultConfig.enabled,
    surfaces: { ...defaultConfig.surfaces },
    execution: { ...defaultConfig.execution },
    templates: { ...defaultConfig.templates },
  };
}

function mergeConfig(
  target: PiCommandTemplateConfig,
  source: PartialPiCommandTemplateConfig,
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
    mergeField(section, 'cwd', `${sectionName}.cwd`, cwdSchema, configPath, errors, (value) => {
      target.execution.cwd = value;
    });
    mergeField(section, 'shell', `${sectionName}.shell`, booleanSchema, configPath, errors, (value) => {
      target.execution.shell = value;
    });
  });

  mergeField(source, 'templates', 'templates', templatesSchema, configPath, errors, (value) => {
    target.templates = { ...target.templates, ...value };
  });
}
