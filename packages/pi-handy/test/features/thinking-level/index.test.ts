import { describe, expect, it } from 'vitest';

import {
  getAvailableThinkingLevels,
  getThinkingLevelArgumentCompletions,
  handleThinkingLevelCommand,
  registerThinkingLevelCommand,
} from '#pi-handy/features/thinking-level/index.js';

type TestModel = {
  id: string;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<
    Record<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh', string | null>
  >;
};

describe('thinking level command', () => {
  it('returns only off for models without reasoning support', () => {
    const noModel: TestModel | undefined = undefined;

    expect(getAvailableThinkingLevels({ id: 'gpt-4o', reasoning: false })).toEqual(['off']);
    expect(getAvailableThinkingLevels(noModel)).toEqual(['off']);
  });

  it('returns standard levels for reasoning models', () => {
    expect(getAvailableThinkingLevels({ id: 'claude-sonnet-4-5', reasoning: true })).toEqual([
      'off',
      'minimal',
      'low',
      'medium',
      'high',
    ]);
  });

  it('uses thinkingLevelMap to expose model-specific supported levels', () => {
    expect(
      getAvailableThinkingLevels({
        id: 'deepseek-v4-pro',
        reasoning: true,
        thinkingLevelMap: {
          minimal: null,
          low: null,
          medium: null,
          high: 'high',
          xhigh: 'max',
        },
      })
    ).toEqual(['off', 'high', 'xhigh']);
  });

  it('hides off when thinking cannot be disabled', () => {
    expect(
      getAvailableThinkingLevels({
        id: 'always-thinking-model',
        reasoning: true,
        thinkingLevelMap: { off: null },
      })
    ).toEqual(['minimal', 'low', 'medium', 'high']);
  });

  it('only includes xhigh when it is explicitly mapped', () => {
    expect(getAvailableThinkingLevels({ id: 'gpt-5.2', reasoning: true })).not.toContain('xhigh');
    expect(
      getAvailableThinkingLevels({
        id: 'claude-opus-4.7',
        reasoning: true,
        thinkingLevelMap: { xhigh: 'xhigh' },
      })
    ).toContain('xhigh');
  });

  it('autocompletes thinking levels available for the current model', () => {
    const completions = getThinkingLevelArgumentCompletions('m', {
      id: 'claude-sonnet-4-5',
      reasoning: true,
    });

    expect(completions).toEqual([
      {
        value: 'minimal',
        label: 'minimal',
        description: 'Use minimal model thinking/reasoning',
      },
      {
        value: 'medium',
        label: 'medium',
        description: 'Use medium model thinking/reasoning',
      },
    ]);
  });

  it('sets a valid thinking level', () => {
    const pi = createPiApi('off');
    const ctx = createCommandContext({ id: 'claude-sonnet-4-5', reasoning: true });

    handleThinkingLevelCommand(pi, 'high', ctx);

    expect(pi.setLevels).toEqual(['high']);
    expect(ctx.notifications).toEqual([{ message: 'Thinking level: high', type: 'info' }]);
  });

  it('shows current level when called without arguments', () => {
    const pi = createPiApi('medium');
    const ctx = createCommandContext({ id: 'claude-sonnet-4-5', reasoning: true });

    handleThinkingLevelCommand(pi, '   ', ctx);

    expect(pi.setLevels).toEqual([]);
    expect(ctx.notifications).toEqual([
      {
        message:
          'Current thinking level: medium. Available levels: off, minimal, low, medium, high.',
        type: 'info',
      },
    ]);
  });

  it('rejects levels unavailable for the current model', () => {
    const pi = createPiApi('off');
    const ctx = createCommandContext({ id: 'gpt-4o', reasoning: false });

    handleThinkingLevelCommand(pi, 'high', ctx);

    expect(pi.setLevels).toEqual([]);
    expect(ctx.notifications).toEqual([{ message: 'Usage: /thinkinglevel off', type: 'warning' }]);
  });

  it('uses the latest session/model event for command argument completions', () => {
    const pi = createRegisteredCommandApi();
    registerThinkingLevelCommand(pi.extensionApi);

    expect(pi.command?.getArgumentCompletions?.('')).toEqual([
      { value: 'off', label: 'off', description: 'Disable model thinking/reasoning' },
    ]);

    pi.emitSessionStart({ id: 'claude-sonnet-4-5', reasoning: true });
    expect(pi.command?.getArgumentCompletions?.('h')).toEqual([
      { value: 'high', label: 'high', description: 'Use high model thinking/reasoning' },
    ]);

    pi.emitModelSelect({ id: 'gpt-5.2', reasoning: true, thinkingLevelMap: { xhigh: 'xhigh' } });
    expect(pi.command?.getArgumentCompletions?.('x')).toEqual([
      {
        value: 'xhigh',
        label: 'xhigh',
        description: 'Use extra-high model thinking/reasoning when supported',
      },
    ]);
  });
});

function createPiApi(currentLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh') {
  return {
    setLevels: [] as string[],
    getThinkingLevel: () => currentLevel,
    setThinkingLevel(level: string) {
      this.setLevels.push(level);
    },
  };
}

function createCommandContext(model: TestModel) {
  const notifications: Array<{ message: string; type: string | undefined }> = [];

  return {
    model,
    notifications,
    ui: {
      notify(message: string, type?: string) {
        notifications.push({ message, type });
      },
    },
  } as unknown as Pick<Parameters<typeof handleThinkingLevelCommand>[2], 'model' | 'ui'> & {
    notifications: Array<{ message: string; type: string | undefined }>;
  };
}

function createRegisteredCommandApi() {
  type Handler = (event: { model?: TestModel }, ctx: { model?: TestModel }) => void;
  type Command = Parameters<
    Parameters<typeof registerThinkingLevelCommand>[0]['registerCommand']
  >[1];

  const handlers = new Map<string, Handler>();
  let command: Command | undefined;

  return {
    get command() {
      return command;
    },
    extensionApi: {
      on(eventName: string, handler: Handler) {
        handlers.set(eventName, handler);
      },
      registerCommand(_name: string, registeredCommand: Command) {
        command = registeredCommand;
      },
    } as unknown as Parameters<typeof registerThinkingLevelCommand>[0],
    emitSessionStart(model: TestModel) {
      handlers.get('session_start')?.({}, { model });
    },
    emitModelSelect(model: TestModel) {
      handlers.get('model_select')?.({ model }, { model });
    },
  };
}
