import { Type } from 'typebox';
import { describe, expect, it, vi } from 'vitest';
import {
  formatToolSchemas,
  getShowSyspromptArgumentCompletions,
  handleShowSyspromptCommand,
  registerShowSyspromptCommand,
} from '#pi-handy/features/show-sysprompt.js';
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

  it('normalizes command arguments and filters active tools', () => {
    const { piApi, commandContext, appendEntry } = createHarness();

    handleShowSyspromptCommand(piApi, '  ToOlS  ', commandContext);

    expect(appendEntry).toHaveBeenCalledOnce();
    expect(appendEntry).toHaveBeenCalledWith('pi-handy-tool-schemas', expect.not.stringContaining('inactive'));
  });

  it('formats tools without parameters and every supported schema type', () => {
    const tools = [
      createTool('empty', {}),
      createTool('types', {
        missing: undefined,
        literal: Type.Literal('fixed'),
        enumeration: Type.Enum({ Fast: 'fast', Slow: 'slow' }),
        union: Type.Union([Type.String(), Type.Number()]),
        oneOf: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
        array: Type.Array(Type.Integer()),
        multiple: { type: ['string', 'null'] },
        unknown: {},
      }),
    ];

    const formatted = formatToolSchemas(tools);

    expect(formatted).toContain('empty - Description\n  (no parameters)');
    expect(formatted).toContain('missing: any [optional]');
    expect(formatted).toContain('literal: "fixed" [optional]');
    expect(formatted).toContain('enumeration: "fast" | "slow" [optional]');
    expect(formatted).toContain('union: string | number [optional]');
    expect(formatted).toContain('oneOf: boolean | null [optional]');
    expect(formatted).toContain('array: integer[] [optional]');
    expect(formatted).toContain('multiple: string | null [optional]');
    expect(formatted).toContain('unknown: any [optional]');
  });

  it('returns case-insensitive completions and no unmatched values', () => {
    expect(getShowSyspromptArgumentCompletions(' T')).toEqual([
      { value: 'tools', label: 'tools', description: 'Show active tools only' },
    ]);
    expect(getShowSyspromptArgumentCompletions('missing')).toEqual([]);
  });

  it('registers renderers and command handlers for collapsed and expanded entries', async () => {
    const renderers = new Map<
      string,
      (entry: { data?: string }, options: { expanded: boolean }, theme: Theme) => unknown
    >();
    let command:
      | {
          getArgumentCompletions(prefix: string): unknown;
          handler(args: string, context: ReturnType<typeof createHarness>['commandContext']): Promise<void>;
        }
      | undefined;
    const harness = createHarness();
    const pi = {
      ...harness.piApi,
      registerEntryRenderer: (name: string, renderer: typeof renderers extends Map<string, infer T> ? T : never) => {
        renderers.set(name, renderer);
      },
      registerCommand: (_name: string, definition: NonNullable<typeof command>) => {
        command = definition;
      },
    };
    const theme = createTheme();

    registerShowSyspromptCommand(pi as never);
    const promptRenderer = renderers.get('pi-handy-system-prompt');
    const toolsRenderer = renderers.get('pi-handy-tool-schemas');
    if (!promptRenderer || !toolsRenderer || !command) throw new Error('show sysprompt handlers were not registered');

    expect(promptRenderer({ data: 'one\r\ntwo' }, { expanded: false }, theme)).toBeDefined();
    expect(promptRenderer({ data: 'one\r\ntwo' }, { expanded: true }, theme)).toBeDefined();
    expect(toolsRenderer({}, { expanded: false }, theme)).toBeDefined();
    expect(command.getArgumentCompletions('p')).toHaveLength(1);
    await command.handler('prompt', harness.commandContext);
    expect(harness.appendEntry).toHaveBeenCalledWith('pi-handy-system-prompt', 'system prompt');
  });
});

type Theme = Parameters<Parameters<ExtensionAPI['registerEntryRenderer']>[1]>[2];

function createTool(name: string, properties: Record<string, unknown>): ToolInfo {
  return {
    name,
    description: 'Description',
    parameters: {
      type: 'object',
      properties,
    } as never,
    sourceInfo: { path: 'test', source: 'test', scope: 'temporary', origin: 'top-level' },
  };
}

function createTheme(): Theme {
  return {
    fg: (_color: string, value: string) => value,
    bg: (_color: string, value: string) => value,
    bold: (value: string) => value,
  } as Theme;
}

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
