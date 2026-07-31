import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';

import type { PiBashCommandsConfig } from '#pi-bash-commands/config/schema.js';
import { registerBashCommands } from '#pi-bash-commands/index.js';

describe('registerBashCommands', () => {
  it('injects PATH into bash calls and appends prompt guidance', async () => {
    // Arrange
    const harness = createHarness();
    registerBashCommands(harness.pi, config());

    // Act
    await harness.emit('session_start', { reason: 'startup' });

    const prompt = await harness.emit('before_agent_start', { systemPrompt: 'base' });
    const bashCall = { type: 'tool_call', toolName: 'bash', toolCallId: '1', input: { command: 'example arg' } };
    const readCall = { type: 'tool_call', toolName: 'read', toolCallId: '2', input: { path: 'file' } };
    await harness.emit('tool_call', bashCall);
    await harness.emit('tool_call', readCall);

    // Assert
    expect(prompt?.systemPrompt).toContain('## Bash Commands');
    expect(bashCall.input.command).toContain('@trethore/pi-bash-commands:path');
    expect(bashCall.input.command.endsWith('example arg')).toBe(true);
    expect(readCall.input).toEqual({ path: 'file' });
    expect(harness.notify).not.toHaveBeenCalled();
    await harness.emit('session_shutdown', { reason: 'quit' });
  });

  it('produces a stable prompt with one guidance section for every agent run', async () => {
    // Arrange
    const harness = createHarness();
    registerBashCommands(harness.pi, config());
    await harness.emit('session_start', { reason: 'startup' });

    // Act
    const firstAgentRun = await harness.emit('before_agent_start', { systemPrompt: 'base' });
    const secondAgentRun = await harness.emit('before_agent_start', { systemPrompt: 'base' });
    const repeatedHandlerInFirstRun = await harness.emit('before_agent_start', {
      systemPrompt: firstAgentRun?.systemPrompt,
    });

    // Assert
    expect(firstAgentRun?.systemPrompt).toBe(secondAgentRun?.systemPrompt);
    expect(countOccurrences(firstAgentRun?.systemPrompt ?? '', '## Bash Commands')).toBe(1);
    expect(countOccurrences(secondAgentRun?.systemPrompt ?? '', '## Bash Commands')).toBe(1);
    expect(repeatedHandlerInFirstRun).toBeUndefined();
    await harness.emit('session_shutdown', { reason: 'quit' });
  });

  it('warns and remains inactive without the active built-in bash tool', async () => {
    // Arrange
    const harness = createHarness({ activeTools: ['read'] });
    registerBashCommands(harness.pi, config());

    // Act
    await harness.emit('session_start', { reason: 'startup' });
    const prompt = await harness.emit('before_agent_start', { systemPrompt: 'base' });

    // Assert
    expect(prompt).toBeUndefined();
    expect(harness.notify).toHaveBeenCalledTimes(1);
    expect(harness.notify).toHaveBeenCalledWith(
      expect.stringContaining('built-in bash tool is unavailable'),
      'warning'
    );
  });

  it('does not add situational commands to the prompt', async () => {
    // Arrange
    const harness = createHarness();
    const situationalConfig = config();
    situationalConfig.commands[0].prompt = undefined;
    registerBashCommands(harness.pi, situationalConfig);

    // Act
    const prompt = await harness.emit('before_agent_start', { systemPrompt: 'base' });

    // Assert
    expect(prompt).toBeUndefined();
  });

  it('adds enabled built-in commands and their help to the prompt', async () => {
    // Arrange
    const harness = createHarness();
    const builtInConfig = config();
    builtInConfig.builtIns = {
      'pi-find': { enabled: false, defaultLimit: 100 },
      'pi-grep': { enabled: true, defaultLimit: 50, defaultLimitPerFile: 3, defaultMaxCharsPerMatch: 500 },
    };
    builtInConfig.commands = [];
    registerBashCommands(harness.pi, builtInConfig);

    // Act
    const prompt = await harness.emit('before_agent_start', { systemPrompt: 'base' });

    // Assert
    expect(prompt?.systemPrompt).toContain('### pi-grep');
    expect(prompt?.systemPrompt).toContain('Usage: pi-grep --regexes <regex> [options]');
    expect(prompt?.systemPrompt).toContain('Defaults to 50.');
    expect(prompt?.systemPrompt).toContain('Defaults to 3.');
    expect(prompt?.systemPrompt).toContain('Defaults to 500.');
    expect(prompt?.systemPrompt).not.toContain('### pi-find');
    await harness.emit('session_shutdown', { reason: 'quit' });
  });

  it('uses the active config values when handling events', async () => {
    // Arrange
    const harness = createHarness();
    const activeConfig = config();
    registerBashCommands(harness.pi, activeConfig);
    activeConfig.commands = [
      {
        enabled: true,
        name: 'updated',
        command: process.execPath,
        args: [],
        env: {},
        prompt: { description: 'Updated command.' },
      },
    ];

    // Act
    const prompt = await harness.emit('before_agent_start', { systemPrompt: 'base' });

    // Assert
    expect(prompt?.systemPrompt).toContain('Description: Updated command.');
    expect(prompt?.systemPrompt).not.toContain('Description: Example command.');
    await harness.emit('session_shutdown', { reason: 'quit' });
  });
});

type HandlerResult = { systemPrompt: string } | undefined;
type Handler = (event: unknown, ctx: ExtensionContext) => HandlerResult | Promise<HandlerResult>;

function createHarness(options: { activeTools?: string[]; source?: string } = {}) {
  const handlers = new Map<string, Handler[]>();
  const notify = vi.fn();
  const activeTools = options.activeTools ?? ['read', 'bash'];
  const source = options.source ?? 'builtin';
  const pi = {
    on(event: string, handler: Handler) {
      const eventHandlers = handlers.get(event) ?? [];
      eventHandlers.push(handler);
      handlers.set(event, eventHandlers);
    },
    getActiveTools: () => activeTools,
    getAllTools: () => [
      {
        name: 'bash',
        description: '',
        parameters: {},
        sourceInfo: { path: '', source, scope: 'temporary', origin: 'top-level' },
      },
    ],
  } as unknown as ExtensionAPI;
  const ctx = { ui: { notify } } as unknown as ExtensionContext;

  return {
    pi,
    notify,
    async emit(event: string, payload: unknown): Promise<HandlerResult> {
      let result: HandlerResult;
      for (const handler of handlers.get(event) ?? []) {
        result = await handler(payload, ctx);
      }
      return result;
    },
  };
}

function config(): PiBashCommandsConfig {
  return {
    enabled: true,
    builtIns: {
      'pi-find': { enabled: false, defaultLimit: 100 },
      'pi-grep': { enabled: false, defaultLimit: 200, defaultMaxCharsPerMatch: 200 },
    },
    commands: [
      {
        enabled: true,
        name: 'example',
        command: process.execPath,
        args: [],
        env: {},
        prompt: { description: 'Example command.' },
      },
    ],
  };
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}
