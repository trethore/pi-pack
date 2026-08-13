import path from 'node:path';

import { loadJsoncExtensionConfig } from '@trethore/shared/config/config-file.js';
import { createConfigMerger } from '@trethore/shared/config/schema.js';
import { isRecord } from '@trethore/shared/object.js';

import { getBashCommandsConfigPaths } from '#src/config/locations.js';
import {
  bashCommandSchema,
  defaultConfig,
  limitSchema,
  maxCharsPerMatchSchema,
  type BashCommandConfig,
  type BuiltInsConfig,
  type LoadedConfig,
  type PartialPiBashCommandsConfig,
  type PiFindBuiltInConfig,
  type PiGrepBuiltInConfig,
  type PiBashCommandsConfig,
} from '#src/config/schema.js';
import { isBuiltInCommandName } from '#src/core/built-in-command-names.js';

const EXTENSION_NAME = 'pi-bash-commands';
const { mergeEnabledField, mergeField } = createConfigMerger(EXTENSION_NAME);

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
  return { ...defaultConfig, builtIns: createBuiltInsConfig(true), commands: [] };
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
  for (const [name, value] of Object.entries(source.builtIns)) {
    if (!isBuiltInCommandName(name)) {
      errors.push(
        `${EXTENSION_NAME} config ignored unknown built-in command ${JSON.stringify(name)} in ${configPath}.`
      );
      continue;
    }
    mergeBuiltInConfig(builtIns, name, value, configPath, errors);
  }
  target.builtIns = builtIns;
}

function mergeBuiltInConfig(
  target: BuiltInsConfig,
  name: keyof BuiltInsConfig,
  source: unknown,
  configPath: string,
  errors: string[]
): void {
  if (typeof source === 'boolean') {
    target[name].enabled = source;
    return;
  }
  if (!isRecord(source)) {
    errors.push(
      `${EXTENSION_NAME} config ignored invalid builtIns.${name} value in ${configPath}; expected boolean or object.`
    );
    return;
  }

  target[name].enabled = true;
  if (name === 'pi-find') {
    mergeFindBuiltInConfig(target[name], source, configPath, errors);
    return;
  }
  mergeGrepBuiltInConfig(target[name], source, configPath, errors);
}

function mergeFindBuiltInConfig(
  target: PiFindBuiltInConfig,
  source: Record<string, unknown>,
  configPath: string,
  errors: string[]
): void {
  mergeLimitedBuiltInConfig(target, source, 'builtIns.pi-find', configPath, errors);
}

function mergeGrepBuiltInConfig(
  target: PiGrepBuiltInConfig,
  source: Record<string, unknown>,
  configPath: string,
  errors: string[]
): void {
  const label = 'builtIns.pi-grep';
  mergeLimitedBuiltInConfig(target, source, label, configPath, errors);
  mergeField(
    source,
    'defaultLimitPerFile',
    `${label}.defaultLimitPerFile`,
    limitSchema,
    configPath,
    errors,
    (value) => {
      target.defaultLimitPerFile = value;
    }
  );
  mergeField(
    source,
    'defaultMaxCharsPerMatch',
    `${label}.defaultMaxCharsPerMatch`,
    maxCharsPerMatchSchema,
    configPath,
    errors,
    (value) => {
      target.defaultMaxCharsPerMatch = value;
    }
  );
}

function mergeLimitedBuiltInConfig(
  target: { enabled: boolean; defaultLimit: number },
  source: Record<string, unknown>,
  label: string,
  configPath: string,
  errors: string[]
): void {
  mergeEnabledField(target, source, `${label}.enabled`, configPath, errors);
  mergeField(source, 'defaultLimit', `${label}.defaultLimit`, limitSchema, configPath, errors, (value) => {
    target.defaultLimit = value;
  });
}

function createBuiltInsConfig(enabled: boolean): BuiltInsConfig {
  return {
    'pi-find': { ...defaultConfig.builtIns['pi-find'], enabled },
    'pi-grep': { ...defaultConfig.builtIns['pi-grep'], enabled },
  };
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
