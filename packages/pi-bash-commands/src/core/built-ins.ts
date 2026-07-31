import { fileURLToPath } from 'node:url';

import { createFindCliEnvironment, createGrepCliEnvironment } from '#src/cli/shared/defaults.js';
import {
  createPiFindHelp,
  createPiGrepHelp,
  PI_FIND_DESCRIPTION,
  PI_GREP_DESCRIPTION,
} from '#src/cli/shared/metadata.js';
import type { BashCommandConfig, BuiltInsConfig, PiBashCommandsConfig } from '#src/config/schema.js';
import { BUILT_IN_COMMAND_NAMES, type BuiltInCommandName } from '#src/core/built-in-command-names.js';

interface BuiltInCommandDefinition {
  description: string;
  entryPoint: string;
}

interface BuiltInCommandRuntime {
  env: Record<string, string>;
  usage: string;
}

const BUILT_IN_COMMAND_DEFINITIONS: Record<BuiltInCommandName, BuiltInCommandDefinition> = {
  'pi-find': {
    description: PI_FIND_DESCRIPTION,
    entryPoint: '../cli/find/index.ts',
  },
  'pi-grep': {
    description: PI_GREP_DESCRIPTION,
    entryPoint: '../cli/grep/index.ts',
  },
};

export function createBashCommands(config: PiBashCommandsConfig): BashCommandConfig[] {
  return [...createBuiltInCommands(config.builtIns), ...config.commands];
}

function createBuiltInCommands(config: BuiltInsConfig): BashCommandConfig[] {
  return BUILT_IN_COMMAND_NAMES.filter((name) => config[name].enabled).map((name) =>
    createBuiltInCommand(name, config)
  );
}

function createBuiltInCommand(name: BuiltInCommandName, config: BuiltInsConfig): BashCommandConfig {
  const definition = BUILT_IN_COMMAND_DEFINITIONS[name];
  const runtime = createBuiltInRuntime(name, config);
  return {
    enabled: true,
    name,
    command: process.execPath,
    args: [fileURLToPath(new URL(definition.entryPoint, import.meta.url))],
    env: runtime.env,
    prompt: { description: definition.description, usage: runtime.usage },
  };
}

function createBuiltInRuntime(name: BuiltInCommandName, config: BuiltInsConfig): BuiltInCommandRuntime {
  if (name === 'pi-find') {
    const findConfig = config[name];
    return {
      env: createFindCliEnvironment(findConfig),
      usage: createPiFindHelp(findConfig),
    };
  }

  const grepConfig = config[name];
  return {
    env: createGrepCliEnvironment(grepConfig),
    usage: createPiGrepHelp(grepConfig),
  };
}
