import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';

import type { PiWhimsicalConfig } from '#pi-whimsical/config/schema.js';
import { pickRandom, registerWorkingMessage } from '#pi-whimsical/core/working-message.js';

const defaultConfig: PiWhimsicalConfig = {
  enabled: true,
  messages: ['Foo...', 'Bar...', 'Baz...'],
};

describe('pickRandom', () => {
  it.each([
    { randomValue: 0, expected: 'Foo...' },
    { randomValue: 0.34, expected: 'Bar...' },
    { randomValue: 0.99, expected: 'Baz...' },
  ])('selects the indexed message for $randomValue', ({ randomValue, expected }) => {
    expect(pickRandom(defaultConfig.messages, () => randomValue)).toBe(expected);
  });
});

describe('registerWorkingMessage', () => {
  it('sets a message at turn start and resets it at turn end', () => {
    // Arrange
    const harness = createExtensionHarness();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    registerWorkingMessage(harness.pi, defaultConfig);

    // Act
    harness.emit('turn_start');
    harness.emit('turn_end');

    // Assert
    expect(harness.setWorkingMessage).toHaveBeenNthCalledWith(1, 'Bar...');
    expect(harness.setWorkingMessage).toHaveBeenNthCalledWith(2);
    randomSpy.mockRestore();
  });

  it('does not register handlers when disabled', () => {
    const harness = createExtensionHarness();

    registerWorkingMessage(harness.pi, { ...defaultConfig, enabled: false });

    expect(harness.handlers.size).toBe(0);
  });
});

type ExtensionHandler = (event: unknown, ctx: ExtensionContext) => void;

function createExtensionHarness() {
  const handlers = new Map<string, ExtensionHandler>();
  const setWorkingMessage = vi.fn();
  const pi = {
    on: (event: string, handler: ExtensionHandler) => {
      handlers.set(event, handler);
    },
  } as unknown as ExtensionAPI;
  const ctx = { ui: { setWorkingMessage } } as unknown as ExtensionContext;

  return {
    pi,
    handlers,
    setWorkingMessage,
    emit: (event: string) => handlers.get(event)?.({}, ctx),
  };
}
