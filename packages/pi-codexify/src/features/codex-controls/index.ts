import type { Api, Model } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  codexReasoningSummaryValues,
  codexVerbosityValues,
  type CodexControlsConfig,
  type CodexReasoningSummary,
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

export interface CodexControlsController {
  getConfig(): CodexControlsConfig;
  updateVerbosity(value: CodexVerbosity | undefined): void;
  updateReasoningSummary(value: CodexReasoningSummary | undefined): void;
}

export function registerCodexControls(pi: ExtensionAPI, config: CodexControlsConfig): CodexControlsController {
  let activeConfig = config;

  pi.on('before_provider_request', (event, ctx) => {
    if (!activeConfig.enabled) return;
    if (!ctx.model || !supportsCodexControls(ctx.model)) return;

    return patchRequestPayload(event.payload, activeConfig, ctx.model);
  });

  return {
    getConfig() {
      return activeConfig;
    },
    updateVerbosity(value) {
      activeConfig = {
        ...activeConfig,
        verbosity: value,
      };
    },
    updateReasoningSummary(value) {
      activeConfig = {
        ...activeConfig,
        reasoningSummary: value,
      };
    },
  };
}

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
    `current model: ${modelLabel}`,
    `verbosity supported here: ${supportsVerbosityControl(model) ? 'yes' : 'no'}`,
    `reasoning summary supported here: ${supportsReasoningSummaryControl(model) ? 'yes' : 'no'}`,
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

function patchRequestPayload(
  payload: unknown,
  config: CodexControlsConfig,
  model: Pick<Model<Api>, 'api' | 'reasoning'>
): unknown {
  if (!isRecord(payload)) return payload;

  const withVerbosity = supportsVerbosityControl(model) ? patchPayloadVerbosity(payload, config.verbosity) : payload;

  return supportsReasoningSummaryControl(model)
    ? patchPayloadReasoningSummary(withVerbosity, config.reasoningSummary)
    : withVerbosity;
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

  const reasoning = isRecord(payload.reasoning) ? payload.reasoning : {};
  return {
    ...payload,
    reasoning: {
      ...reasoning,
      summary: reasoningSummary,
    },
  };
}
