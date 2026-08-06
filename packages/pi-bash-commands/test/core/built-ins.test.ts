import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import type { BashCommandConfig, PiBashCommandsConfig } from '#pi-bash-commands/config/schema.js';
import { createBashCommands } from '#pi-bash-commands/core/built-ins.js';
import {
  createPiFindHelp,
  createPiGrepHelp,
  PI_FIND_HELP,
  PI_GREP_HELP,
} from '#pi-bash-commands/cli/shared/metadata.js';

describe('createBashCommands', () => {
  it('prepends enabled built-ins to configured commands', () => {
    // Arrange
    const config = createConfig(false, true);

    // Act
    const commands = createBashCommands(config);

    // Assert
    expect(commands.map((command) => command.name)).toEqual(['pi-grep', 'example']);
    expect(commands[0]).toMatchObject({
      command: process.execPath,
      prompt: { usage: PI_GREP_HELP },
    });
    expect(commands[0]?.args[0]).toMatch(/grep\/index\.ts$/);
  });

  it('creates both built-ins with help-backed prompt usage', () => {
    // Arrange
    const config = createConfig(true, true);

    // Act
    const commands = createBashCommands(config);

    // Assert
    expect(commands.slice(0, 2).map((command) => command.name)).toEqual(['pi-find', 'pi-grep']);
    expect(commands[0]?.prompt?.description).toBe(
      'Find files recursively under search roots using `rg --files`, optionally filtered by ripgrep-style glob patterns. Use for file discovery; prefer it when its options are sufficient because it produces bounded, token-efficient output.'
    );
    expect(commands[1]?.prompt?.description).toBe(
      "Search file contents using ripgrep via `rg --json -n -e '<regex>' -g '<glob>' <path(s)>`. Use to explore text across files; prefer it when its options are sufficient because it produces bounded, token-efficient output."
    );
    expect(commands[0]?.prompt?.usage).toBe(PI_FIND_HELP);
    expect(commands[1]?.prompt?.usage).toBe(PI_GREP_HELP);
  });

  it('executes a built-in CLI through its command descriptor', () => {
    // Arrange
    const [command] = createBashCommands(createConfig(true, false));
    if (command === undefined) throw new Error('Expected pi-find command');

    // Act
    const output = executeHelp(command);

    // Assert
    expect(output).toBe(`${PI_FIND_HELP}\n`);
  });

  it('passes configured defaults to built-in CLIs and prompt usage', () => {
    // Arrange
    const config = createConfig(true, true);
    config.builtIns['pi-find'].defaultLimit = 25;
    config.builtIns['pi-grep'] = {
      enabled: true,
      defaultLimit: 50,
      defaultLimitPerFile: 3,
      defaultMaxCharsPerMatch: 500,
    };

    // Act
    const commands = createBashCommands(config);
    const findCommand = getCommand(commands, 0);
    const grepCommand = getCommand(commands, 1);
    const findHelp = executeHelp(findCommand);
    const grepHelp = executeHelp(grepCommand);

    // Assert
    expect(findCommand.env).toEqual({ PI_BASH_COMMANDS_FIND_DEFAULT_LIMIT: '25' });
    expect(findCommand.prompt?.usage).toBe(createPiFindHelp({ defaultLimit: 25 }));
    expect(grepCommand.env).toEqual({
      PI_BASH_COMMANDS_GREP_DEFAULT_LIMIT: '50',
      PI_BASH_COMMANDS_GREP_DEFAULT_LIMIT_PER_FILE: '3',
      PI_BASH_COMMANDS_GREP_DEFAULT_MAX_CHARS_PER_MATCH: '500',
    });
    expect(grepCommand.prompt?.usage).toBe(
      createPiGrepHelp({
        defaultLimit: 50,
        defaultLimitPerFile: 3,
        defaultMaxCharsPerMatch: 500,
      })
    );
    expect(findHelp).toBe(`${findCommand.prompt?.usage}\n`);
    expect(grepHelp).toBe(`${grepCommand.prompt?.usage}\n`);
  });
});

function getCommand(commands: BashCommandConfig[], index: number): BashCommandConfig {
  const command = commands[index];
  if (command === undefined) throw new Error(`Expected command at index ${index}`);
  return command;
}

function executeHelp(command: BashCommandConfig): string {
  return execFileSync(command.command, [...command.args, '--help'], {
    encoding: 'utf8',
    env: { ...process.env, ...command.env },
  });
}

function createConfig(findEnabled: boolean, grepEnabled: boolean): PiBashCommandsConfig {
  return {
    enabled: true,
    builtIns: {
      'pi-find': { enabled: findEnabled, defaultLimit: 100 },
      'pi-grep': { enabled: grepEnabled, defaultLimit: 200, defaultMaxCharsPerMatch: 200 },
    },
    commands: [{ enabled: true, name: 'example', command: process.execPath, args: [], env: {} }],
  };
}
