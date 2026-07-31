import path from 'node:path';

import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { isRecord } from '@trethore/pi-shared/object.js';

import { getBashCommandsConfigPaths } from '#src/config/locations.js';
import {
  bashCommandSchema,
  defaultConfig,
  type BashCommandConfig,
  type LoadedConfig,
  type PartialPiBashCommandsConfig,
  type PiBashCommandsConfig,
} from '#src/config/schema.js';
import { BUILT_IN_COMMAND_NAMES, isBuiltInCommandName } from '#src/core/built-in-command-names.js';

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
  return { ...defaultConfig, builtIns: { ...defaultConfig.builtIns }, commands: [] };
}

function mergeConfig(
  target: PiBashCommandsConfig,
  source: PartialPiBashCommandsConfig,
  configPath: string,
  errors: string[]
): void {
  mergeEnabledField(target, source, 'enabled', configPath, errors);
  mergeBuiltIns(target, source, configPath, errors);
  if (source.commands === undefined) return;
  if (!Array.isArray(source.commands)) {
    errors.push(`${EXTENSION_NAME} config ignored invalid commands value in ${configPath}; expected array.`);
    return;
  }

  target.commands = parseCommands(source.commands, configPath, errors);
}

function mergeBuiltIns(
  target: PiBashCommandsConfig,
  source: PartialPiBashCommandsConfig,
  configPath: string,
  errors: string[]
): void {
  if (source.builtIns === undefined) return;
  if (typeof source.builtIns === 'boolean') {
    target.builtIns = createBuiltInsConfig(source.builtIns);
    return;
  }
  if (!isRecord(source.builtIns)) {
    errors.push(
      `${EXTENSION_NAME} config ignored invalid builtIns value in ${configPath}; expected boolean or object.`
    );
    return;
  }

  const builtIns = createBuiltInsConfig(false);
  for (const [name, enabled] of Object.entries(source.builtIns)) {
    if (!isBuiltInCommandName(name)) {
      errors.push(
        `${EXTENSION_NAME} config ignored unknown built-in command ${JSON.stringify(name)} in ${configPath}.`
      );
      continue;
    }
    if (typeof enabled !== 'boolean') {
      errors.push(
        `${EXTENSION_NAME} config ignored invalid builtIns.${name} value in ${configPath}; expected boolean.`
      );
      continue;
    }
    builtIns[name] = enabled;
  }
  target.builtIns = builtIns;
}

function createBuiltInsConfig(enabled: boolean): PiBashCommandsConfig['builtIns'] {
  return Object.fromEntries(BUILT_IN_COMMAND_NAMES.map((name) => [name, enabled])) as PiBashCommandsConfig['builtIns'];
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
    if (isBuiltInCommandName(parsed.data.name)) {
      errors.push(
        `${EXTENSION_NAME} config ignored reserved built-in command name ${JSON.stringify(parsed.data.name)} in ${configPath}.`
      );
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
