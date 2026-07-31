import { describe, expect, it } from 'vitest';

import type { BashCommandConfig } from '#pi-bash-commands/config/schema.js';
import { BASH_COMMANDS_PROMPT_MARKER, buildBashCommandsPrompt } from '#pi-bash-commands/core/prompt.js';

describe('buildBashCommandsPrompt', () => {
  it('formats populated prompt metadata in command order', () => {
    const commands = [
      command('first', { description: 'First description', usage: 'first [file]' }),
      command('situational'),
      command('third', { usage: 'third --help' }),
    ];

    const prompt = buildBashCommandsPrompt(commands);

    expect(prompt).toBe(`${BASH_COMMANDS_PROMPT_MARKER}
## Bash Commands

These commands are available through Pi's bash tool.

### first

Description: First description

Usage: first [file]

### third

Usage: third --help`);
  });

  it('returns no prompt for situational or disabled commands', () => {
    expect(
      buildBashCommandsPrompt([
        command('situational'),
        { ...command('disabled', { usage: 'disabled' }), enabled: false },
      ])
    ).toBeUndefined();
  });
});

function command(name: string, prompt?: BashCommandConfig['prompt']): BashCommandConfig {
  return { enabled: true, name, command: process.execPath, args: [], env: {}, prompt };
}
