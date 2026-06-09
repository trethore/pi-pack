import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatGreyTimeTaken, formatTimeTaken, registerTimeTakenFeature } from '#pi-handy/features/time-taken/index.js';

describe('time taken feature', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [0, 'Took 0s'],
    [5900, 'Took 6s'],
    [59_499, 'Took 59s'],
    [59_500, 'Took 1m0s'],
    [60_000, 'Took 1m0s'],
    [65_000, 'Took 1m5s'],
    [125_000, 'Took 2m5s'],
  ])('formats %dms as %s', (elapsedMs, expectedMessage) => {
    expect(formatTimeTaken(elapsedMs)).toBe(expectedMessage);
  });

  it('formats elapsed time in grey', () => {
    expect(formatGreyTimeTaken(6500)).toBe('\u001B[90mTook 7s\u001B[39m');
  });

  it('appends elapsed time to the final assistant message', () => {
    // Arrange
    const dateNow = vi.spyOn(Date, 'now');
    dateNow.mockReturnValueOnce(1000).mockReturnValueOnce(6500);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    piApi.emitAgentStart();
    const result = piApi.emitMessageEnd(createAssistantMessage('Done'));

    // Assert
    expect(result?.message).toEqual(
      createAssistantMessage('Done', [{ type: 'text', text: '\u001B[90mTook 6s\u001B[39m' }])
    );
  });

  it('does not append elapsed time before the assistant message ends', () => {
    // Arrange
    const dateNow = vi.spyOn(Date, 'now');
    dateNow.mockReturnValue(1000);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    piApi.emitAgentStart();

    // Assert
    expect(piApi.emitMessageEnd(createAssistantMessage('Done'))?.message.content).toEqual([
      { type: 'text', text: 'Done' },
      { type: 'text', text: '\u001B[90mTook 0s\u001B[39m' },
    ]);
  });

  it('does not append without an agent start', () => {
    // Arrange
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    const result = piApi.emitMessageEnd(createAssistantMessage('Done'));

    // Assert
    expect(result).toBeUndefined();
  });

  it('does not append to tool-use assistant messages', () => {
    // Arrange
    const dateNow = vi.spyOn(Date, 'now');
    dateNow.mockReturnValueOnce(1000).mockReturnValueOnce(6500);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    piApi.emitAgentStart();
    const result = piApi.emitMessageEnd(createAssistantMessage('Calling tool', [], 'toolUse'));

    // Assert
    expect(result).toBeUndefined();
  });

  it('resets the timer between runs', () => {
    // Arrange
    const dateNow = vi.spyOn(Date, 'now');
    dateNow.mockReturnValueOnce(1000).mockReturnValueOnce(2000).mockReturnValueOnce(10_000).mockReturnValueOnce(75_000);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    piApi.emitAgentStart();
    const firstResult = piApi.emitMessageEnd(createAssistantMessage('First'));
    piApi.emitAgentStart();
    const secondResult = piApi.emitMessageEnd(createAssistantMessage('Second'));

    // Assert
    expect(firstResult?.message.content).toEqual([
      { type: 'text', text: 'First' },
      { type: 'text', text: '\u001B[90mTook 1s\u001B[39m' },
    ]);
    expect(secondResult?.message.content).toEqual([
      { type: 'text', text: 'Second' },
      { type: 'text', text: '\u001B[90mTook 1m5s\u001B[39m' },
    ]);
  });
});

type AgentStartHandler = () => void;
type MessageEndHandler = (event: {
  type: 'message_end';
  message: AssistantMessage;
}) => { message: AssistantMessage } | undefined;

type AssistantMessage = {
  role: 'assistant';
  content: Array<{ type: string; text?: string }>;
  stopReason: string;
};

function createPiApi() {
  const handlers = new Map<string, AgentStartHandler | MessageEndHandler>();

  return {
    extensionApi: {
      on(eventName: string, handler: AgentStartHandler | MessageEndHandler) {
        handlers.set(eventName, handler);
      },
    } as unknown as Parameters<typeof registerTimeTakenFeature>[0],
    emitAgentStart() {
      const handler = handlers.get('agent_start') as AgentStartHandler | undefined;
      handler?.();
    },
    emitMessageEnd(message: AssistantMessage) {
      const handler = handlers.get('message_end') as MessageEndHandler | undefined;
      return handler?.({ type: 'message_end', message });
    },
  };
}

function createAssistantMessage(
  text: string,
  extraContent: AssistantMessage['content'] = [],
  stopReason = 'stop'
): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }, ...extraContent],
    stopReason,
  };
}
