import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import type { PiCodexifyConfig } from '#src/config/schema.js';
import { applyCodexControls } from '#src/features/codex-controls/index.js';
import { applyNativeWebSearch } from '#src/features/web-search/index.js';

export function registerProviderRequestMutations(pi: ExtensionAPI, getConfig: () => PiCodexifyConfig): void {
  pi.on('before_provider_request', (event, ctx) => {
    const config = getConfig();
    if (!config.enabled) return;

    let payload = event.payload;
    if (config.codex.enabled && ctx.model) payload = applyCodexControls(payload, config.codex, ctx.model);
    if (config.webSearch.enabled) payload = applyNativeWebSearch(payload, ctx.model);

    return payload === event.payload ? undefined : payload;
  });
}
