import { describe, expect, it } from 'vitest';

import {
  getAvailableThinkingLevels,
  getThinkingLevelArgumentCompletions,
  handleThinkingLevelCommand,
  registerThinkingLevelCommand,
} from '#pi-handy/features/thinking-level.js';

type TestModel = {
  id: string;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh', string | null>>;
};

describe('thinking level command', () => {
  it('returns only off for models without reasoning support', () => {
    // Arrange
    const nonReasoningModel = { id: 'gpt-4o', reasoning: false };
    const missingModel: TestModel | undefined = undefined;

    // Act
    const levelsForNonReasoningModel = getAvailableThinkingLevels(nonReasoningModel);
    const levelsWithoutModel = getAvailableThinkingLevels(missingModel);

    // Assert
    expect(levelsForNonReasoningModel).toEqual(['off']);
    expect(levelsWithoutModel).toEqual(['off']);
  });

  it('returns standard levels for reasoning models', () => {
    // Arrange
    const reasoningModel = { id: 'claude-sonnet-4-5', reasoning: true };

    // Act
    const availableLevels = getAvailableThinkingLevels(reasoningModel);

    // Assert
    expect(availableLevels).toEqual(['off', 'minimal', 'low', 'medium', 'high']);
  });

  it('uses thinkingLevelMap to expose model-specific supported levels', () => {
    // Arrange
    const modelWithCustomLevelMap = {
      id: 'deepseek-v4-pro',
      reasoning: true,
      thinkingLevelMap: {
        minimal: null,
        low: null,
        medium: null,
        high: 'high',
        xhigh: 'max',
      },
    };

    // Act
    const availableLevels = getAvailableThinkingLevels(modelWithCustomLevelMap);

    // Assert
    expect(availableLevels).toEqual(['off', 'high', 'xhigh']);
  });

  it('hides off when thinking cannot be disabled', () => {
    // Arrange
    const alwaysThinkingModel = {
      id: 'always-thinking-model',
      reasoning: true,
      thinkingLevelMap: { off: null },
    };

    // Act
    const availableLevels = getAvailableThinkingLevels(alwaysThinkingModel);

    // Assert
    expect(availableLevels).toEqual(['minimal', 'low', 'medium', 'high']);
  });

  it('only includes xhigh when it is explicitly mapped', () => {
    // Arrange
    const standardReasoningModel = { id: 'gpt-5.2', reasoning: true };
    const modelWithExtraHighThinking = {
      id: 'claude-opus-4.7',
      reasoning: true,
      thinkingLevelMap: { xhigh: 'xhigh' },
    };

    // Act
    const standardLevels = getAvailableThinkingLevels(standardReasoningModel);
    const levelsWithExtraHighThinking = getAvailableThinkingLevels(modelWithExtraHighThinking);

    // Assert
    expect(standardLevels).not.toContain('xhigh');
    expect(levelsWithExtraHighThinking).toContain('xhigh');
  });

  it('autocompletes thinking levels available for the current model', () => {
    // Arrange
    const currentModel = { id: 'claude-sonnet-4-5', reasoning: true };

    // Act
    const completions = getThinkingLevelArgumentCompletions('m', currentModel);

    // Assert
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
    // Arrange
    const piApi = createPiApi('off');
    const commandContext = createCommandContext({ id: 'claude-sonnet-4-5', reasoning: true });

    // Act
    handleThinkingLevelCommand(piApi, 'high', commandContext);

    // Assert
    expect(piApi.setLevels).toEqual(['high']);
    expect(commandContext.notifications).toEqual([{ message: 'Thinking level: high', type: 'info' }]);
  });

  it('shows current level when called without arguments', () => {
    // Arrange
    const piApi = createPiApi('medium');
    const commandContext = createCommandContext({ id: 'claude-sonnet-4-5', reasoning: true });

    // Act
    handleThinkingLevelCommand(piApi, '   ', commandContext);

    // Assert
    expect(piApi.setLevels).toEqual([]);
    expect(commandContext.notifications).toEqual([
      {
        message: 'Current thinking level: medium. Available levels: off, minimal, low, medium, high.',
        type: 'info',
      },
    ]);
  });

  it('rejects levels unavailable for the current model', () => {
    // Arrange
    const piApi = createPiApi('off');
    const commandContext = createCommandContext({ id: 'gpt-4o', reasoning: false });

    // Act
    handleThinkingLevelCommand(piApi, 'high', commandContext);

    // Assert
    expect(piApi.setLevels).toEqual([]);
    expect(commandContext.notifications).toEqual([{ message: 'Usage: /thinkinglevel off', type: 'warning' }]);
  });

  it('uses the latest session/model event for command argument completions', () => {
    // Arrange
    const piApi = createRegisteredCommandApi();
    registerThinkingLevelCommand(piApi.extensionApi);

    // Act and assert
    expect(piApi.command?.getArgumentCompletions?.('')).toEqual([
      { value: 'off', label: 'off', description: 'Disable model thinking/reasoning' },
    ]);

    piApi.emitSessionStart({ id: 'claude-sonnet-4-5', reasoning: true });
    expect(piApi.command?.getArgumentCompletions?.('h')).toEqual([
      { value: 'high', label: 'high', description: 'Use high model thinking/reasoning' },
    ]);

    piApi.emitModelSelect({ id: 'gpt-5.2', reasoning: true, thinkingLevelMap: { xhigh: 'xhigh' } });
    expect(piApi.command?.getArgumentCompletions?.('x')).toEqual([
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
  type Command = Parameters<Parameters<typeof registerThinkingLevelCommand>[0]['registerCommand']>[1];

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
