import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';

import type { PiNotifyConfig } from '#pi-notify/config/schema.js';
import { registerNotificationFeature } from '#pi-notify/core/notification.js';

const DEFAULT_CONFIG: PiNotifyConfig = {
  enabled: true,
  message: 'Ready for input',
  cooldown: 90,
  unfocusedOnly: false,
  protocol: 'auto',
};

describe('notification feature', () => {
  it('sends a notification after the agent fully settles', () => {
    // Arrange
    const harness = createHarness({ environment: { KITTY_WINDOW_ID: '1' } });

    // Act
    harness.emitAgentSettled('tui');

    // Assert
    expect(harness.sequences).toHaveLength(1);
    expect(harness.sequences[0]).toContain('\u001B]99;');
    expect(harness.sequences[0]).toContain('UmVhZHkgZm9yIGlucHV0');
  });

  it('respects the cooldown between notifications', () => {
    // Arrange
    const harness = createHarness({ timestamps: [1000, 90_999, 91_000] });

    // Act
    harness.emitAgentSettled('tui');
    harness.emitAgentSettled('tui');
    harness.emitAgentSettled('tui');

    // Assert
    expect(harness.sequences).toHaveLength(2);
  });

  it('allows every notification when cooldown is zero', () => {
    // Arrange
    const harness = createHarness({ config: { cooldown: 0 }, timestamps: [1000, 1000] });

    // Act
    harness.emitAgentSettled('tui');
    harness.emitAgentSettled('tui');

    // Assert
    expect(harness.sequences).toHaveLength(2);
  });

  it.each(['rpc', 'json', 'print'] as const)('does not write terminal sequences in %s mode', (mode) => {
    // Arrange
    const harness = createHarness();

    // Act
    harness.emitAgentSettled(mode);

    // Assert
    expect(harness.sequences).toEqual([]);
  });

  it('does not notify when disabled', () => {
    // Arrange
    const harness = createHarness({ config: { enabled: false } });

    // Act
    harness.emitAgentSettled('tui');

    // Assert
    expect(harness.sequences).toEqual([]);
  });

  it('uses the configured protocol override', () => {
    // Arrange
    const harness = createHarness({ config: { protocol: 'osc9' }, environment: { KITTY_WINDOW_ID: '1' } });

    // Act
    harness.emitAgentSettled('tui');

    // Assert
    expect(harness.sequences[0]).toBe('\u001B]9;Ready for input\u001B\\');
  });

  it('warns when unfocusedOnly is unavailable for the resolved protocol', () => {
    // Arrange
    const harness = createHarness({ config: { unfocusedOnly: true }, environment: { TERM_PROGRAM: 'ghostty' } });

    // Act
    harness.emitSessionStart();

    // Assert
    expect(harness.notify).toHaveBeenCalledWith(
      'pi-notify unfocusedOnly requires OSC 99; OSC 777 notifications cannot detect terminal focus.',
      'warning'
    );
  });

  it('does not warn when OSC 99 can enforce unfocusedOnly', () => {
    // Arrange
    const harness = createHarness({ config: { unfocusedOnly: true }, environment: { KITTY_WINDOW_ID: '1' } });

    // Act
    harness.emitSessionStart();
    harness.emitAgentSettled('tui');

    // Assert
    expect(harness.notify).not.toHaveBeenCalled();
    expect(harness.sequences[0]).toContain('o=unfocused');
  });
});

type EventHandler = (event: unknown, context: ExtensionContext) => void;

interface HarnessOptions {
  config?: Partial<PiNotifyConfig>;
  environment?: NodeJS.ProcessEnv;
  timestamps?: number[];
}

function createHarness(options: HarnessOptions = {}) {
  const handlers = new Map<string, EventHandler>();
  const sequences: string[] = [];
  const notify = vi.fn();
  const timestamps = options.timestamps ?? [1000];
  let timestampIndex = 0;
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const pi = {
    on(event: string, handler: EventHandler) {
      handlers.set(event, handler);
    },
  } as unknown as ExtensionAPI;

  registerNotificationFeature(pi, config, {
    environment: options.environment ?? {},
    now: () => timestamps[timestampIndex++] ?? timestamps.at(-1) ?? 0,
    write: (sequence) => sequences.push(sequence),
  });

  return {
    notify,
    sequences,
    emitSessionStart: () => {
      emit('session_start', 'tui');
    },
    emitAgentSettled: (mode: ExtensionContext['mode']) => {
      emit('agent_settled', mode);
    },
  };

  function emit(event: string, mode: ExtensionContext['mode']): void {
    handlers.get(event)?.({ type: event }, {
      mode,
      ui: { notify },
    } as unknown as ExtensionContext);
  }
}
