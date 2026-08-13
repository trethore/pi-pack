import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTimeoutTransformer, removeTimeoutTransformer } from '@trethore/shared/unsafe/timeout-transform.js';

const transformerId = 'test:timeout';
let originalSetTimeout: typeof globalThis.setTimeout;

beforeEach(() => {
  originalSetTimeout = globalThis.setTimeout;
});

afterEach(() => {
  removeTimeoutTransformer(transformerId);
  globalThis.setTimeout = originalSetTimeout;
});

describe('unsafe timeout transforms', () => {
  it('transforms matching timeout delays', () => {
    // Arrange
    const timeoutSpy = vi.fn(() => 1 as unknown as NodeJS.Timeout);
    globalThis.setTimeout = timeoutSpy as unknown as typeof globalThis.setTimeout;
    registerTimeoutTransformer(createPi(), transformerId, ({ delay }) => (delay === 300_000 ? 1_800_000 : delay));

    // Act
    setTimeout(() => {}, 300_000);
    setTimeout(() => {}, 1000);

    // Assert
    expect(timeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 1_800_000);
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 1000);
  });

  it('removes a transformer on extension reload', () => {
    // Arrange
    const handlers: Array<(event: { reason: string }) => void> = [];
    const pi = {
      on: (_event: string, handler: (event: { reason: string }) => void) => handlers.push(handler),
    } as unknown as ExtensionAPI;
    registerTimeoutTransformer(pi, transformerId, ({ delay }) => delay);

    // Act
    handlers[0]?.({ reason: 'reload' });

    // Assert
    expect(globalThis.setTimeout).toBe(originalSetTimeout);
  });

  it('preserves properties on the original timeout function', () => {
    // Arrange
    const promisifiedSetTimeout = promisify(globalThis.setTimeout);

    // Act
    registerTimeoutTransformer(createPi(), transformerId, ({ delay }) => delay);

    // Assert
    expect(promisify(globalThis.setTimeout)).toBe(promisifiedSetTimeout);
  });
});

function createPi(): ExtensionAPI {
  return { on: () => {} } as unknown as ExtensionAPI;
}
