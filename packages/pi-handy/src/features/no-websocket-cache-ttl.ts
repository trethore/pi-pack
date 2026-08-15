import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerTimeoutTransformer, SUPPRESS_TIMEOUT } from '@trethore/shared/unsafe/timeout-transform.js';

const TRANSFORMER_ID = 'pi-handy:no-websocket-cache-ttl';
const PI_CODEX_WEBSOCKET_CACHE_TTL_MS = 5 * 60 * 1000;

export function registerNoWebSocketCacheTtlFeature(pi: ExtensionAPI): void {
  registerTimeoutTransformer(pi, TRANSFORMER_ID, ({ delay, getStack }) => {
    if (delay !== PI_CODEX_WEBSOCKET_CACHE_TTL_MS) return delay;
    return isPiCodexWebSocketExpiry(getStack()) ? SUPPRESS_TIMEOUT : delay;
  });
}

export function isPiCodexWebSocketExpiry(stack: string): boolean {
  return stack.includes('scheduleSessionWebSocketExpiry') && stack.includes('openai-codex-responses');
}
