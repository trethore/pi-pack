import type { Api, Model } from '@earendil-works/pi-ai';
import {
  codexReasoningSummaryValues,
  codexServiceTierValues,
  codexVerbosityValues,
  type CodexControlsConfig,
  type CodexReasoningSummary,
  type CodexServiceTier,
  type CodexVerbosity,
} from '#src/config/schema.js';
import { isRecord } from '@trethore/pi-shared/object.js';

type SupportedCodexControlApi = 'openai-responses' | 'openai-codex-responses' | 'azure-openai-responses';

type MutableJsonObject = Record<string, unknown>;

const SUPPORTED_APIS = new Set<SupportedCodexControlApi>([
  'openai-responses',
  'openai-codex-responses',
  'azure-openai-responses',
]);

export function parseCodexVerbosity(value: string): CodexVerbosity | 'off' | undefined {
  if (value === 'off') return 'off';
  if (codexVerbosityValues.includes(value as CodexVerbosity)) return value as CodexVerbosity;
  return undefined;
}

export function parseCodexReasoningSummary(value: string): CodexReasoningSummary | 'off' | undefined {
  if (value === 'off') return 'off';
  if (codexReasoningSummaryValues.includes(value as CodexReasoningSummary)) {
    return value as CodexReasoningSummary;
  }

  return undefined;
}

export function parseCodexServiceTier(value: string): CodexServiceTier | undefined {
  if (codexServiceTierValues.includes(value as CodexServiceTier)) return value as CodexServiceTier;
  return undefined;
}

export function buildCodexControlsStatusMessage(
  config: CodexControlsConfig,
  model: Pick<Model<Api>, 'provider' | 'id' | 'api' | 'reasoning'> | undefined
): string {
  const modelLabel = model ? `${model.provider}/${model.id}` : 'none';

  return [
    'Codex controls',
    `enabled: ${config.enabled ? 'yes' : 'no'}`,
    `verbosity: ${config.verbosity ?? 'off'}`,
    `reasoning summary: ${config.reasoningSummary ?? 'off'}`,
    `service tier: ${config.serviceTier ?? 'default'}`,
    `current model: ${modelLabel}`,
    `verbosity supported here: ${supportsVerbosityControl(model) ? 'yes' : 'no'}`,
    `reasoning summary supported here: ${supportsReasoningSummaryControl(model) ? 'yes' : 'no'}`,
    `service tier supported here: ${supportsCodexControls(model) ? 'yes' : 'no'}`,
  ].join('\n');
}

function supportsCodexControls(model: Pick<Model<Api>, 'api'> | undefined): boolean {
  if (!model) return false;
  return SUPPORTED_APIS.has(model.api as SupportedCodexControlApi);
}

function supportsVerbosityControl(model: Pick<Model<Api>, 'api'> | undefined): boolean {
  return supportsCodexControls(model);
}

function supportsReasoningSummaryControl(model: Pick<Model<Api>, 'api' | 'reasoning'> | undefined): boolean {
  return supportsCodexControls(model) && model?.reasoning === true;
}

export function applyCodexControls(
  payload: unknown,
  config: CodexControlsConfig,
  model: Pick<Model<Api>, 'api' | 'reasoning'>
): unknown {
  if (!isRecord(payload) || !supportsCodexControls(model)) return payload;

  const withVerbosity = supportsVerbosityControl(model) ? patchPayloadVerbosity(payload, config.verbosity) : payload;
  const withServiceTier = patchPayloadServiceTier(withVerbosity, config.serviceTier);

  return shouldPatchReasoningSummary(config, model)
    ? patchPayloadReasoningSummary(withServiceTier, config.reasoningSummary)
    : withServiceTier;
}

function shouldPatchReasoningSummary(
  config: CodexControlsConfig,
  model: Pick<Model<Api>, 'api' | 'reasoning'>
): boolean {
  return config.reasoningSummary === 'none' || supportsReasoningSummaryControl(model);
}

function patchPayloadVerbosity(payload: MutableJsonObject, verbosity: CodexVerbosity | undefined): MutableJsonObject {
  if (!verbosity) return payload;

  const text = isRecord(payload.text) ? payload.text : {};
  return {
    ...payload,
    text: {
      ...text,
      verbosity,
    },
  };
}

function patchPayloadReasoningSummary(
  payload: MutableJsonObject,
  reasoningSummary: CodexReasoningSummary | undefined
): MutableJsonObject {
  if (!reasoningSummary) return payload;

  if (reasoningSummary === 'none') {
    return removePayloadReasoningSummary(payload);
  }

  const reasoning = isRecord(payload.reasoning) ? payload.reasoning : {};
  return {
    ...payload,
    reasoning: {
      ...reasoning,
      summary: reasoningSummary,
    },
  };
}

function removePayloadReasoningSummary(payload: MutableJsonObject): MutableJsonObject {
  if (!isRecord(payload.reasoning) || !Object.hasOwn(payload.reasoning, 'summary')) return payload;

  const reasoning = { ...payload.reasoning };
  delete reasoning.summary;
  if (Object.keys(reasoning).length === 0) {
    const payloadWithoutReasoning = { ...payload };
    delete payloadWithoutReasoning.reasoning;
    return payloadWithoutReasoning;
  }

  return {
    ...payload,
    reasoning,
  };
}

function patchPayloadServiceTier(
  payload: MutableJsonObject,
  serviceTier: CodexServiceTier | undefined
): MutableJsonObject {
  if (serviceTier !== 'priority') return payload;

  return {
    ...payload,
    service_tier: 'priority',
  };
}
