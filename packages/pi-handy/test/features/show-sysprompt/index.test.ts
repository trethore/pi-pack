import { Type } from 'typebox';
import { describe, expect, it, vi } from 'vitest';
import {
  formatToolSchemas,
  getShowSyspromptArgumentCompletions,
  handleShowSyspromptCommand,
} from '#pi-handy/features/show-sysprompt/index.js';
import type { ExtensionAPI, ToolInfo } from '@mariozechner/pi-coding-agent';

describe('show sysprompt command', () => {
  it('shows prompt and tools when invoked without args', () => {
    // Arrange
    const { piApi, commandContext, sendMessage } = createHarness();

    // Act
    handleShowSyspromptCommand(piApi, '', commandContext);

    // Assert
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenNthCalledWith(1, {
      customType: 'pi-handy-system-prompt',
      content: 'system prompt',
      display: true,
    });
    expect(sendMessage).toHaveBeenNthCalledWith(2, {
      customType: 'pi-handy-tool-schemas',
      content: expect.stringContaining('bash - Run shell commands'),
      display: true,
    });
  });

  it('shows only the requested section', () => {
    // Arrange
    const { piApi, commandContext, sendMessage } = createHarness();

    // Act
    handleShowSyspromptCommand(piApi, 'tools', commandContext);

    // Assert
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({
      customType: 'pi-handy-tool-schemas',
      content: expect.stringContaining('command: string [required] - Command to run'),
      display: true,
    });
  });

  it('notifies on invalid args', () => {
    // Arrange
    const { piApi, commandContext, sendMessage, notify } = createHarness();

    // Act
    handleShowSyspromptCommand(piApi, 'all', commandContext);

    // Assert
    expect(sendMessage).not.toHaveBeenCalled();
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
  const sendMessage = vi.fn();
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
    sendMessage,
  } satisfies Pick<ExtensionAPI, 'getActiveTools' | 'getAllTools' | 'sendMessage'>;
  const commandContext = {
    getSystemPrompt: () => 'system prompt',
    ui: { notify },
  };

  return { piApi, commandContext, sendMessage, notify };
}
