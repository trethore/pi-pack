import { describe, expect, it } from 'vitest';
import { isPiCodexWebSocketExpiry } from '#pi-handy/features/websocket-cache-ttl.js';

describe('WebSocket cache TTL feature', () => {
  it.each([
    [
      'at scheduleSessionWebSocketExpiry (/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js:770)',
      true,
    ],
    ['at scheduleSessionWebSocketExpiry (/other/provider.js:770)', false],
    ['at anotherFunction (/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js:770)', false],
  ])('identifies only the Pi Codex idle timer', (stack, expected) => {
    // Act
    const result = isPiCodexWebSocketExpiry(stack);

    // Assert
    expect(result).toBe(expected);
  });
});
