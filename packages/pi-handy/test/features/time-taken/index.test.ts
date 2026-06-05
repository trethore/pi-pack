import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatTimeTaken, registerTimeTakenFeature } from '#pi-handy/features/time-taken/index.js';

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

  it('notifies elapsed time when the agent ends', () => {
    // Arrange
    const dateNow = vi.spyOn(Date, 'now');
    dateNow.mockReturnValueOnce(1000).mockReturnValueOnce(6500);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    piApi.emitAgentStart();
    piApi.emitAgentEnd({ hasUI: true });

    // Assert
    expect(piApi.notifications).toEqual([{ message: 'Took 6s', type: 'info' }]);
  });

  it('does not notify before the agent ends', () => {
    // Arrange
    const dateNow = vi.spyOn(Date, 'now');
    dateNow.mockReturnValue(1000);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    piApi.emitAgentStart();

    // Assert
    expect(piApi.notifications).toEqual([]);
  });

  it('does not notify without UI', () => {
    // Arrange
    const dateNow = vi.spyOn(Date, 'now');
    dateNow.mockReturnValueOnce(1000).mockReturnValueOnce(6500);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    piApi.emitAgentStart();
    piApi.emitAgentEnd({ hasUI: false });

    // Assert
    expect(piApi.notifications).toEqual([]);
  });

  it('resets the timer between runs', () => {
    // Arrange
    const dateNow = vi.spyOn(Date, 'now');
    dateNow
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(10_000)
      .mockReturnValueOnce(75_000);
    const piApi = createPiApi();
    registerTimeTakenFeature(piApi.extensionApi);

    // Act
    piApi.emitAgentStart();
    piApi.emitAgentEnd({ hasUI: true });
    piApi.emitAgentStart();
    piApi.emitAgentEnd({ hasUI: true });

    // Assert
    expect(piApi.notifications).toEqual([
      { message: 'Took 1s', type: 'info' },
      { message: 'Took 1m5s', type: 'info' },
    ]);
  });
});

type AgentStartHandler = () => void;
type AgentEndHandler = (
  event: { type: 'agent_end'; messages: [] },
  ctx: { hasUI: boolean; ui: { notify(message: string, type?: string): void } }
) => void;

function createPiApi() {
  const handlers = new Map<string, AgentStartHandler | AgentEndHandler>();
  const notifications: Array<{ message: string; type: string | undefined }> = [];

  return {
    notifications,
    extensionApi: {
      on(eventName: string, handler: AgentStartHandler | AgentEndHandler) {
        handlers.set(eventName, handler);
      },
    } as unknown as Parameters<typeof registerTimeTakenFeature>[0],
    emitAgentStart() {
      const handler = handlers.get('agent_start') as AgentStartHandler | undefined;
      handler?.();
    },
    emitAgentEnd(options: { hasUI: boolean }) {
      const handler = handlers.get('agent_end') as AgentEndHandler | undefined;
      handler?.(
        { type: 'agent_end', messages: [] },
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
