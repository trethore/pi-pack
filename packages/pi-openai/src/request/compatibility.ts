import { Feature, ReasoningSummary, ServiceTier } from "#src/constants";
import type { Settings } from "#src/config/settings";

export interface RequestModel {
  id: string;
  provider: string;
  api: string;
  baseUrl: string;
  reasoning: boolean;
}

export { Feature } from "#src/constants";

export const RequestFormat = {
  RESPONSES: "responses",
  COMPLETIONS: "completions",
} as const;
export type RequestFormat = (typeof RequestFormat)[keyof typeof RequestFormat];
export interface Decision {
  apply: boolean;
  description: string;
}

const supportedResponsesApis = new Set(["openai-responses", "azure-openai-responses"]);
const supportedModels = new Set([
  "gpt-5.5",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-6-astra",
  "gpt-6-luna",
  "gpt-6-sol",
  "gpt-6.1-sol",
]);
const azurePriorityModels = new Set(["gpt-5.5", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-6-sol"]);

export function requestFormat(model: RequestModel): RequestFormat | undefined {
  if (supportedResponsesApis.has(model.api)) {
    return RequestFormat.RESPONSES;
  }
  if (model.api === "openai-completions") {
    return RequestFormat.COMPLETIONS;
  }
  return undefined;
}

const Endpoint = {
  OPENAI: "openai",
  COPILOT: "copilot",
  AZURE: "azure",
} as const;
type Endpoint = (typeof Endpoint)[keyof typeof Endpoint];
const endpoints = new Map<string, { name: Endpoint; pattern: RegExp }>([
  ["openai", { name: Endpoint.OPENAI, pattern: /^https:\/\/api\.openai\.com\/v1\/?$/ }],
  [
    "github-copilot",
    {
      name: Endpoint.COPILOT,
      pattern: /^https:\/\/api\.(?:(?:individual|business|enterprise)\.)?githubcopilot\.com\/?$/,
    },
  ],
  [
    "azure-openai-responses",
    {
      name: Endpoint.AZURE,
      pattern: /^https:\/\/[a-z0-9-]+\.(?:openai\.azure\.com|services\.ai\.azure\.com)(?:\/[^?#]*)?$/,
    },
  ],
]);

function endpoint(model: RequestModel): Endpoint | undefined {
  const candidate = endpoints.get(model.provider);
  return candidate?.pattern.test(model.baseUrl) ? candidate.name : undefined;
}

function summaryRestriction(settings: Settings, model: RequestModel): string | undefined {
  if (!model.reasoning) {
    return "Model is not reasoning-capable";
  }
  if (settings.reasoningSummary === ReasoningSummary.CONCISE) {
    return "Concise summary support is unverified for this model";
  }
  return undefined;
}

function hostedFeatureRestriction(feature: Feature, host: Endpoint, id: string): string | undefined {
  if (host === Endpoint.COPILOT) {
    return "Native feature support is unverified on this endpoint";
  }
  if (host === Endpoint.AZURE && feature === Feature.SERVICE_TIER && !azurePriorityModels.has(id)) {
    return "Priority processing support is unverified for this Azure model";
  }
  return undefined;
}

function safeRestriction(feature: Feature, settings: Settings, model: RequestModel): string | undefined {
  const host = endpoint(model);
  if (host === undefined) {
    return "Provider or endpoint support is unverified";
  }
  const id = model.id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (!supportedModels.has(id)) {
    return "Model support is limited to known GPT-5.5 and newer models";
  }
  if (feature === Feature.VERBOSITY) {
    return undefined;
  }
  if (feature === Feature.REASONING_SUMMARY) {
    return summaryRestriction(settings, model);
  }
  return hostedFeatureRestriction(feature, host, id);
}

function inactive(feature: Feature, settings: Settings): boolean {
  const value = settings[feature];
  return value === null || value === false || value === ServiceTier.DEFAULT;
}

function actionDecision(feature: Feature, settings: Settings, format: RequestFormat | undefined): Decision {
  if (!format) {
    return { apply: true, description: "Attempt on compatible request payload (support checks bypassed)" };
  }
  if (format === RequestFormat.COMPLETIONS && feature !== Feature.VERBOSITY) {
    return { apply: false, description: "Skipped: requires a Responses payload" };
  }
  const descriptions = {
    verbosity: format === RequestFormat.RESPONSES ? "Set text.verbosity" : "Set verbosity",
    reasoningSummary:
      settings.reasoningSummary === ReasoningSummary.NONE ? "Remove reasoning.summary" : "Set reasoning.summary",
    webSearch: "Add native web search if absent",
    serviceTier: "Set service_tier to priority",
  };
  const suffix = settings.allowUnsupported ? " (support checks bypassed)" : "";
  return { apply: true, description: descriptions[feature] + suffix };
}

export function featureDecision(
  feature: Feature,
  settings: Settings,
  model: RequestModel | undefined,
  payloadFormat?: RequestFormat,
): Decision {
  if (!settings.enabled) {
    return { apply: false, description: "Disabled: leave unchanged" };
  }
  if (inactive(feature, settings)) {
    return { apply: false, description: "Leave unchanged" };
  }
  if (!model) {
    return { apply: false, description: "Skipped: no model selected" };
  }
  const format = settings.allowUnsupported ? payloadFormat : requestFormat(model);
  if (!format && !settings.allowUnsupported) {
    return { apply: false, description: "Skipped: unsupported API format" };
  }
  const restriction = settings.allowUnsupported ? undefined : safeRestriction(feature, settings, model);
  if (restriction) {
    return { apply: false, description: `Skipped: ${restriction}` };
  }
  return actionDecision(feature, settings, format);
}
