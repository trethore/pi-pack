import { Type } from 'typebox';
import { describe, expect, it, vi } from 'vitest';
import {
  formatToolSchemas,
  getShowSyspromptArgumentCompletions,
  handleShowSyspromptCommand,
} from '#pi-handy/features/show-sysprompt/index.js';
import type { ExtensionAPI, ToolInfo } from '@earendil-works/pi-coding-agent';

describe('show sysprompt command', () => {
  it('shows prompt and tools when invoked without args', () => {
    // Arrange
    const { piApi, commandContext, appendEntry } = createHarness();

    // Act
    handleShowSyspromptCommand(piApi, '', commandContext);

    // Assert
    expect(appendEntry).toHaveBeenCalledTimes(2);
    expect(appendEntry).toHaveBeenNthCalledWith(1, 'pi-handy-system-prompt', 'system prompt');
    expect(appendEntry).toHaveBeenNthCalledWith(
      2,
      'pi-handy-tool-schemas',
      expect.stringContaining('bash - Run shell commands')
    );
  });

  it('shows only the requested section', () => {
    // Arrange
    const { piApi, commandContext, appendEntry } = createHarness();

    // Act
    handleShowSyspromptCommand(piApi, 'tools', commandContext);

    // Assert
    expect(appendEntry).toHaveBeenCalledOnce();
    expect(appendEntry).toHaveBeenCalledWith(
      'pi-handy-tool-schemas',
      expect.stringContaining('command: string [required] - Command to run')
    );
  });

  it('notifies on invalid args', () => {
    // Arrange
    const { piApi, commandContext, appendEntry, notify } = createHarness();

    // Act
    handleShowSyspromptCommand(piApi, 'all', commandContext);

    // Assert
    expect(appendEntry).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Usage: /showsysprompt [prompt|tools]', 'warning');
  });

  it('formats empty active tool lists', () => {
    expect(formatToolSchemas([])).toBe('No active tools.');
  });

  it('completes prompt and tools args', () => {
    // Act
    const completions = getShowSyspromptArgumentCompletions('p');

    // Assert
    expect(completions).toEqual([
      {
        value: 'prompt',
        label: 'prompt',
        description: 'Show system prompt only',
      },
    ]);
  });
});

function createHarness() {
  const appendEntry = vi.fn();
  const notify = vi.fn();
  const piApi = {
    getActiveTools: () => ['bash'],
    getAllTools: () => [
      {
        name: 'bash',
        description: 'Run shell commands',
        parameters: Type.Object({
          command: Type.String({ description: 'Command to run' }),
          timeout: Type.Optional(Type.Number({ description: 'Timeout in seconds' })),
        }),
        sourceInfo: {
          path: 'test',
          source: 'test',
          scope: 'temporary',
          origin: 'top-level',
        },
      } satisfies ToolInfo,
    ],
    appendEntry,
  } satisfies Pick<ExtensionAPI, 'appendEntry' | 'getActiveTools' | 'getAllTools'>;
  const commandContext = {
    getSystemPrompt: () => 'system prompt',
    ui: { notify },
  };

  return { piApi, commandContext, appendEntry, notify };
}
