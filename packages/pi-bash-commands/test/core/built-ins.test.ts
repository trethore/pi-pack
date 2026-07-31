import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import type { PiBashCommandsConfig } from '#pi-bash-commands/config/schema.js';
import { createBashCommands } from '#pi-bash-commands/core/built-ins.js';
import { PI_FIND_HELP, PI_GREP_HELP } from '#pi-bash-commands/cli/shared/metadata.js';

describe('createBashCommands', () => {
  it('prepends enabled built-ins to configured commands', () => {
    // Arrange
    const config = createConfig({ 'pi-find': false, 'pi-grep': true });

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
    const config = createConfig({ 'pi-find': true, 'pi-grep': true });

    // Act
    const commands = createBashCommands(config);

    // Assert
    expect(commands.slice(0, 2).map((command) => command.name)).toEqual(['pi-find', 'pi-grep']);
    expect(commands[0]?.prompt?.usage).toBe(PI_FIND_HELP);
    expect(commands[1]?.prompt?.usage).toBe(PI_GREP_HELP);
  });

  it('executes a built-in CLI through its command descriptor', () => {
    // Arrange
    const [command] = createBashCommands(createConfig({ 'pi-find': true, 'pi-grep': false }));
    if (command === undefined) throw new Error('Expected pi-find command');

    // Act
    const output = execFileSync(command.command, [...command.args, '--help'], { encoding: 'utf8' });

    // Assert
    expect(output).toBe(`${PI_FIND_HELP}\n`);
  });
});

function createConfig(builtIns: PiBashCommandsConfig['builtIns']): PiBashCommandsConfig {
  return {
    enabled: true,
    builtIns,
    commands: [{ enabled: true, name: 'example', command: process.execPath, args: [], env: {} }],
  };
}
