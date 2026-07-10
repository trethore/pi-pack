import type { ExtensionAPI, ToolResultEvent } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { defaultConfig, type PiCutConfig } from '#pi-cut/config/schema.js';
import { registerToolResultPipeline } from '#pi-cut/features/tool-result-pipeline.js';

type ToolResultHandler = (
  event: ToolResultEvent
) => { content?: ToolResultEvent['content']; details?: unknown; isError?: boolean } | undefined;

describe('registerToolResultPipeline', () => {
  it('leaves error results unchanged by default', () => {
    // Arrange
    const handler = registerPipeline(makeConfig());
    const event = makeToolResultEvent('abcdef', true);

    // Act
    const result = handler(event);

    // Assert
    expect(result).toBeUndefined();
  });

  it('transforms error results when enabled', () => {
    // Arrange
    const handler = registerPipeline(makeConfig({ transformErrors: true }));
    const event = makeToolResultEvent('abcdef', true);

    // Act
    const result = handler(event);

    // Assert
    expect(result?.content).toEqual([{ type: 'text', text: 'abc [... truncated at 3/6 chars]' }]);
  });

  it('detects repetitions before folding new lines', () => {
    // Arrange
    const handler = registerPipeline(
      makeConfig({
        lineTruncation: { ...defaultConfig.lineTruncation, enabled: false },
        repetitionFolding: {
          ...defaultConfig.repetitionFolding,
          minSavedLines: 0,
          minSavedTokens: 0,
        },
        newLinesFolding: { enabled: true, minNewLines: 3, foldTo: 2 },
      })
    );
    const event = makeToolResultEvent('section\n\n\nx\nsection\n\n\n\nx\n', false);

    // Act
    const result = handler(event);

    // Assert
    expect(result?.content).toEqual([{ type: 'text', text: 'section\n\nx\nsection\n\nx\n' }]);
  });
});

function registerPipeline(config: PiCutConfig): ToolResultHandler {
  let handler: ToolResultHandler | undefined;
  const pi = {
    on: (eventName: string, registeredHandler: ToolResultHandler) => {
      if (eventName === 'tool_result') handler = registeredHandler;
    },
  } as unknown as ExtensionAPI;

  registerToolResultPipeline(pi, config);
  if (!handler) throw new Error('tool_result handler was not registered');
  return handler;
}

function makeConfig(overrides: Partial<PiCutConfig> = {}): PiCutConfig {
  return {
    ...defaultConfig,
    terminalCleanup: { ...defaultConfig.terminalCleanup },
    repetitionFolding: { ...defaultConfig.repetitionFolding },
    newLinesFolding: { ...defaultConfig.newLinesFolding },
    lineTruncation: { ...defaultConfig.lineTruncation, maxChars: 3 },
    tools: [],
    ...overrides,
  };
}

function makeToolResultEvent(text: string, isError: boolean): ToolResultEvent {
  return {
    type: 'tool_result',
    toolCallId: 'tool-call',
    toolName: 'custom',
    input: {},
    content: [{ type: 'text', text }],
    details: undefined,
    isError,
  };
}
