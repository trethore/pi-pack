import type { Api, Model } from '@earendil-works/pi-ai';
import { isRecord } from '@trethore/pi-shared/object.js';
import type { CodexReasoningSummary, CodexServiceTier, CodexVerbosity, ControlsConfig } from '#src/config/types.js';

type SupportedApi = 'openai-responses' | 'openai-codex-responses' | 'azure-openai-responses';
type MutablePayload = Record<string, unknown>;

const SUPPORTED_APIS = new Set<SupportedApi>(['openai-responses', 'openai-codex-responses', 'azure-openai-responses']);

export function applyControls(
  payload: unknown,
  controls: ControlsConfig,
  model: Pick<Model<Api>, 'api' | 'reasoning'>
): unknown {
  if (!isRecord(payload) || !supportsControls(model)) return payload;

  let result = applyVerbosity(payload, controls.verbosity);
  result = applyServiceTier(result, controls.serviceTier);

  if (controls.reasoningSummary === 'none' || supportsReasoningSummary(model)) {
    result = applyReasoningSummary(result, controls.reasoningSummary);
  }

  return result;
}

export function supportsControls(model: Pick<Model<Api>, 'api'> | undefined): boolean {
  return model !== undefined && SUPPORTED_APIS.has(model.api as SupportedApi);
}

export function supportsReasoningSummary(model: Pick<Model<Api>, 'api' | 'reasoning'> | undefined): boolean {
  return supportsControls(model) && model?.reasoning === true;
}

function applyVerbosity(payload: MutablePayload, verbosity: CodexVerbosity | undefined): MutablePayload {
  if (!verbosity) return payload;
  const text = isRecord(payload.text) ? payload.text : {};
  return { ...payload, text: { ...text, verbosity } };
}

function applyReasoningSummary(payload: MutablePayload, summary: CodexReasoningSummary | undefined): MutablePayload {
  if (!summary) return payload;
  if (summary === 'none') return removeReasoningSummary(payload);

  const reasoning = isRecord(payload.reasoning) ? payload.reasoning : {};
  return { ...payload, reasoning: { ...reasoning, summary } };
}

function removeReasoningSummary(payload: MutablePayload): MutablePayload {
  if (!isRecord(payload.reasoning) || !Object.hasOwn(payload.reasoning, 'summary')) return payload;

  const reasoning = { ...payload.reasoning };
  delete reasoning.summary;
  if (Object.keys(reasoning).length > 0) return { ...payload, reasoning };

  const result = { ...payload };
  delete result.reasoning;
  return result;
}

function applyServiceTier(payload: MutablePayload, serviceTier: CodexServiceTier | undefined): MutablePayload {
  return serviceTier === 'priority' ? { ...payload, service_tier: 'priority' } : payload;
}
