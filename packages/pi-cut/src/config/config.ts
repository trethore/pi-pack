import { readConfigFile } from '#src/config/config-file.js';
import { getConfigPaths } from '#src/config/locations.js';
import { mergeField, mergeSection } from '#src/config/merge.js';
import {
  defaultConfig,
  type LoadedConfig,
  type PartialPiCutConfig,
  type PiCutConfig,
} from '#src/config/schema.js';
import { mergeLineTruncationFields } from '#src/config/sections/line-truncation.js';
import { mergeRepetitionFoldingFields } from '#src/config/sections/repetition-folding.js';
import { mergeTerminalCleanupFields } from '#src/config/sections/terminal-cleanup.js';
import { mergeToolOverrides } from '#src/config/tool-overrides.js';
import { booleanSchema } from '#src/config/validation.js';

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const config = cloneDefaultConfig();

  for (const configPath of getConfigPaths(cwd)) {
    const parsedConfig = readConfigFile(configPath, errors);
    if (parsedConfig) mergeConfig(config, parsedConfig, configPath, errors);
  }

  return { config, errors };
}

function cloneDefaultConfig(): PiCutConfig {
  return {
    ...defaultConfig,
    terminalCleanup: { ...defaultConfig.terminalCleanup },
    repetitionFolding: { ...defaultConfig.repetitionFolding },
    lineTruncation: { ...defaultConfig.lineTruncation },
    tools: [],
  };
}

function mergeConfig(
  target: PiCutConfig,
  source: PartialPiCutConfig,
  configPath: string,
  errors: string[]
) {
  mergeField(source, 'enabled', 'enabled', booleanSchema, configPath, errors, (value) => {
    target.enabled = value;
  });

  mergeSection(source, 'terminalCleanup', configPath, errors, (section, sectionName) => {
    mergeTerminalCleanupFields(target.terminalCleanup, section, sectionName, configPath, errors);
  });
  mergeSection(source, 'repetitionFolding', configPath, errors, (section, sectionName) => {
    mergeRepetitionFoldingFields(
      target.repetitionFolding,
      section,
      sectionName,
      configPath,
      errors
    );
  });
  mergeSection(source, 'lineTruncation', configPath, errors, (section, sectionName) => {
    mergeLineTruncationFields(target.lineTruncation, section, sectionName, configPath, errors);
  });
  mergeToolOverrides(target, source, configPath, errors);
}
