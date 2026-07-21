import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { PiCodexifyConfig } from '#src/config/types.js';
import { applyControls } from '#src/control/apply.js';
import { applyWebSearch } from '#src/control/web-search.js';

export function registerProviderRequest(pi: ExtensionAPI, getConfig: () => PiCodexifyConfig): void {
  pi.on('before_provider_request', (event, ctx) => {
    const config = getConfig();
    if (!config.enabled || !config.controls.enabled) return;

    let payload = event.payload;
    if (ctx.model) payload = applyControls(payload, config.controls, ctx.model);
    if (config.controls.webSearch) payload = applyWebSearch(payload, ctx.model);

    return payload === event.payload ? undefined : payload;
  });
}
