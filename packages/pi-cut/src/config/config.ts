import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { getCutConfigPaths } from '#src/config/locations.js';
import { mergeEnabledField, mergeSection } from '#src/config/merge.js';
import { defaultConfig, type LoadedConfig, type PartialPiCutConfig, type PiCutConfig } from '#src/config/schema.js';
import { mergeLineTruncationFields } from '#src/config/sections/line-truncation.js';
import { mergeNewLinesFoldingFields } from '#src/config/sections/new-lines-folding.js';
import { mergeRepetitionFoldingFields } from '#src/config/sections/repetition-folding.js';
import { mergeTerminalCleanupFields } from '#src/config/sections/terminal-cleanup.js';
import { mergeToolOverrides } from '#src/config/tool-overrides.js';
const EXTENSION_NAME = 'pi-cut';

export function loadConfig(cwd: string): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths: getCutConfigPaths,
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
}

function cloneDefaultConfig(): PiCutConfig {
  return {
    ...defaultConfig,
    terminalCleanup: { ...defaultConfig.terminalCleanup },
    repetitionFolding: { ...defaultConfig.repetitionFolding },
    newLinesFolding: { ...defaultConfig.newLinesFolding },
    lineTruncation: { ...defaultConfig.lineTruncation },
    tools: [],
  };
}

function mergeConfig(target: PiCutConfig, source: PartialPiCutConfig, configPath: string, errors: string[]) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);

  mergeSection(source, 'terminalCleanup', configPath, errors, (section, sectionName) => {
    mergeTerminalCleanupFields(target.terminalCleanup, section, sectionName, configPath, errors);
  });
  mergeSection(source, 'repetitionFolding', configPath, errors, (section, sectionName) => {
    mergeRepetitionFoldingFields(target.repetitionFolding, section, sectionName, configPath, errors);
  });
  mergeSection(source, 'newLinesFolding', configPath, errors, (section, sectionName) => {
    mergeNewLinesFoldingFields(target.newLinesFolding, section, sectionName, configPath, errors);
  });
  mergeSection(source, 'lineTruncation', configPath, errors, (section, sectionName) => {
    mergeLineTruncationFields(target.lineTruncation, section, sectionName, configPath, errors);
  });
  mergeToolOverrides(target, source, configPath, errors);
}
