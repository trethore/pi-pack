import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerTimeoutTransformer } from '@trethore/pi-shared/unsafe/timeout-transform.js';
import type { WebSocketCacheTtlFeatureConfig } from '#src/config/schema.js';

const TRANSFORMER_ID = 'pi-handy:websocket-cache-ttl';
const PI_CODEX_WEBSOCKET_CACHE_TTL_MS = 5 * 60 * 1000;

export function registerWebSocketCacheTtlFeature(pi: ExtensionAPI, config: WebSocketCacheTtlFeatureConfig): void {
  const configuredTtlMs = config.ttlMinutes * 60 * 1000;
  registerTimeoutTransformer(pi, TRANSFORMER_ID, ({ delay, getStack }) => {
    if (delay !== PI_CODEX_WEBSOCKET_CACHE_TTL_MS) return delay;
    return isPiCodexWebSocketExpiry(getStack()) ? configuredTtlMs : delay;
  });
}

export function isPiCodexWebSocketExpiry(stack: string): boolean {
  return stack.includes('scheduleSessionWebSocketExpiry') && stack.includes('openai-codex-responses');
}
