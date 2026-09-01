import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { PiCodexifyConfig } from '#src/config/types.js';

const CODEX_ROUTING_HINT_HEADER = 'x-codex-routing-hint';

export function registerProviderHeaders(pi: ExtensionAPI, getConfig: () => PiCodexifyConfig): void {
  pi.on('before_provider_headers', (event, ctx) => {
    const config = getConfig();
    const model = ctx.model;
    if (
      !config.enabled ||
      !config.controls.enabled ||
      config.controls.serviceTier !== 'priority' ||
      model?.provider.toLowerCase() !== 'openai-codex' ||
      model.api !== 'openai-codex-responses'
    ) {
      return;
    }

    event.headers[CODEX_ROUTING_HINT_HEADER] = `model=${model.id};tier=priority`;
  });
}
