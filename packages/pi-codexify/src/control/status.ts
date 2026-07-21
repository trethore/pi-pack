import type { Api, Model } from '@earendil-works/pi-ai';
import type { ControlsConfig } from '#src/config/types.js';
import { supportsControls, supportsReasoningSummary } from '#src/control/apply.js';

export function buildControlsStatus(
  controls: ControlsConfig,
  model: Pick<Model<Api>, 'provider' | 'id' | 'api' | 'reasoning'> | undefined
): string {
  return [
    'Codex controls',
    `enabled: ${yesNo(controls.enabled)}`,
    `verbosity: ${controls.verbosity ?? 'off'}`,
    `reasoning summary: ${controls.reasoningSummary ?? 'off'}`,
    `service tier: ${controls.serviceTier ?? 'default'}`,
    `native web_search: ${yesNo(controls.webSearch)}`,
    `current model: ${model ? `${model.provider}/${model.id}` : 'none'}`,
    `verbosity supported here: ${yesNo(supportsControls(model))}`,
    `reasoning summary supported here: ${yesNo(supportsReasoningSummary(model))}`,
    `service tier supported here: ${yesNo(supportsControls(model))}`,
  ].join('\n');
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}
