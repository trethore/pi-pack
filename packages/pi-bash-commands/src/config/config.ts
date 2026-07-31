import path from 'node:path';

import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger } from '@trethore/pi-shared/config/schema.js';

import { getBashCommandsConfigPaths } from '#src/config/locations.js';
import {
  bashCommandSchema,
  defaultConfig,
  type BashCommandConfig,
  type LoadedConfig,
  type PartialPiBashCommandsConfig,
  type PiBashCommandsConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-bash-commands';
const { mergeEnabledField } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string, options: { includeProject?: boolean } = {}): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths: (configCwd) => getBashCommandsConfigPaths(configCwd, options.includeProject),
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
}

function cloneDefaultConfig(): PiBashCommandsConfig {
  return { ...defaultConfig, commands: [] };
}

function mergeConfig(
  target: PiBashCommandsConfig,
  source: PartialPiBashCommandsConfig,
  configPath: string,
  errors: string[]
): void {
  mergeEnabledField(target, source, 'enabled', configPath, errors);
  if (source.commands === undefined) return;
  if (!Array.isArray(source.commands)) {
    errors.push(`${EXTENSION_NAME} config ignored invalid commands value in ${configPath}; expected array.`);
    return;
  }

  target.commands = parseCommands(source.commands, configPath, errors);
}

function parseCommands(values: unknown[], configPath: string, errors: string[]): BashCommandConfig[] {
  const commands: BashCommandConfig[] = [];
  const enabledNames = new Set<string>();

  for (const [index, value] of values.entries()) {
    const parsed = bashCommandSchema.safeParse(value);
    if (!parsed.success) {
      errors.push(`${EXTENSION_NAME} config ignored invalid commands[${index}] in ${configPath}.`);
      continue;
    }
    if (!path.isAbsolute(parsed.data.command)) {
      errors.push(`${EXTENSION_NAME} config ignored commands[${index}] in ${configPath}; command must be absolute.`);
      continue;
    }
    if (parsed.data.enabled && enabledNames.has(parsed.data.name)) {
      errors.push(
        `${EXTENSION_NAME} config ignored duplicate enabled command name ${JSON.stringify(parsed.data.name)} in ${configPath}.`
      );
      continue;
    }

    commands.push(parsed.data);
    if (parsed.data.enabled) enabledNames.add(parsed.data.name);
  }

  return commands;
}
