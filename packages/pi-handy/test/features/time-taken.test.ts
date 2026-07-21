import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatTimeTaken, registerTimeTakenFeature } from '#pi-handy/features/time-taken.js';

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

  it('notifies elapsed time when the agent settles', () => {
    // Arrange
    mockNowSequence(1000, 6500);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    runAgentCycle(piApi, true);

    // Assert
    expect(piApi.notifications).toEqual([{ message: 'Took 6s', type: 'info' }]);
  });

  it('does not notify before the agent settles', () => {
    // Arrange
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    piApi.emitAgentStart();

    // Assert
    expect(piApi.notifications).toEqual([]);
  });

  it('does not notify without UI', () => {
    // Arrange
    mockNowSequence(1000, 6500);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    runAgentCycle(piApi, false);

    // Assert
    expect(piApi.notifications).toEqual([]);
  });

  it('resets the timer between runs', () => {
    // Arrange
    mockNowSequence(1000, 2000, 10_000, 75_000);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    runAgentCycle(piApi, true);
    runAgentCycle(piApi, true);

    // Assert
    expect(piApi.notifications).toEqual([
      { message: 'Took 1s', type: 'info' },
      { message: 'Took 1m5s', type: 'info' },
    ]);
  });

  it('includes automatic continuation runs in the elapsed time', () => {
    // Arrange
    mockNowSequence(1000, 6500);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    piApi.emitAgentStart();
    piApi.emitAgentStart();
    piApi.emitAgentSettled({ hasUI: true });

    // Assert
    expect(piApi.notifications).toEqual([{ message: 'Took 6s', type: 'info' }]);
  });
});

type AgentStartHandler = () => void;
type AgentSettledHandler = (
  event: { type: 'agent_settled' },
  ctx: { hasUI: boolean; ui: { notify(message: string, type?: string): void } }
) => void;

function createPiApi() {
  const handlers = new Map<string, AgentStartHandler | AgentSettledHandler>();
  const notifications: Array<{ message: string; type: string | undefined }> = [];

  return {
    notifications,
    extensionApi: {
      on(eventName: string, handler: AgentStartHandler | AgentSettledHandler) {
        handlers.set(eventName, handler);
      },
    } as unknown as Parameters<typeof registerTimeTakenFeature>[0],
    emitAgentStart() {
      const handler = handlers.get('agent_start') as AgentStartHandler | undefined;
      handler?.();
    },
    emitAgentSettled(options: { hasUI: boolean }) {
      const handler = handlers.get('agent_settled') as AgentSettledHandler | undefined;
      handler?.(
        { type: 'agent_settled' },
        {
          hasUI: options.hasUI,
          ui: {
            notify(message: string, type?: string) {
              notifications.push({ message, type });
            },
          },
        }
      );
    },
  };
}

function mockNowSequence(...timestamps: number[]): void {
  const dateNow = vi.spyOn(Date, 'now');
  for (const timestamp of timestamps) dateNow.mockReturnValueOnce(timestamp);
}

function runAgentCycle(piApi: ReturnType<typeof createPiApi>, hasUI: boolean): void {
  piApi.emitAgentStart();
  piApi.emitAgentSettled({ hasUI });
}
