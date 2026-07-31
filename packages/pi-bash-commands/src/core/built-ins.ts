import { fileURLToPath } from 'node:url';

import type { BashCommandConfig, PiBashCommandsConfig } from '#src/config/schema.js';
import { PI_FIND_DESCRIPTION, PI_FIND_HELP, PI_GREP_DESCRIPTION, PI_GREP_HELP } from '#src/cli/shared/metadata.js';
import { BUILT_IN_COMMAND_NAMES, type BuiltInCommandName } from '#src/core/built-in-command-names.js';

interface BuiltInCommandDefinition {
  description: string;
  entryPoint: string;
  usage: string;
}

const BUILT_IN_COMMAND_DEFINITIONS: Record<BuiltInCommandName, BuiltInCommandDefinition> = {
  'pi-find': {
    description: PI_FIND_DESCRIPTION,
    entryPoint: '../cli/find/index.ts',
    usage: PI_FIND_HELP,
  },
  'pi-grep': {
    description: PI_GREP_DESCRIPTION,
    entryPoint: '../cli/grep/index.ts',
    usage: PI_GREP_HELP,
  },
};

export function createBashCommands(config: PiBashCommandsConfig): BashCommandConfig[] {
  return [...createBuiltInCommands(config.builtIns), ...config.commands];
}

function createBuiltInCommands(enabled: PiBashCommandsConfig['builtIns']): BashCommandConfig[] {
  return BUILT_IN_COMMAND_NAMES.filter((name) => enabled[name]).map((name) => createBuiltInCommand(name));
}

function createBuiltInCommand(name: BuiltInCommandName): BashCommandConfig {
  const definition = BUILT_IN_COMMAND_DEFINITIONS[name];
  return {
    enabled: true,
    name,
    command: process.execPath,
    args: [fileURLToPath(new URL(definition.entryPoint, import.meta.url))],
    env: {},
    prompt: { description: definition.description, usage: definition.usage },
  };
}
