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

const responsesApis = new Set(["openai-responses", "azure-openai-responses", "openai-codex-responses"]);
const supportedModels = new Set([
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-6-astra",
  "gpt-6-luna",
  "gpt-6-sol",
  "gpt-6.1-sol",
]);

export function requestFormat(model: RequestModel): RequestFormat | undefined {
  if (responsesApis.has(model.api)) {
    return RequestFormat.RESPONSES;
  }
  if (model.api === "openai-completions") {
    return RequestFormat.COMPLETIONS;
  }
  return undefined;
}

const Endpoint = {
  OPENAI: "openai",
  CODEX: "codex",
  COPILOT: "copilot",
  AZURE: "azure",
} as const;
type Endpoint = (typeof Endpoint)[keyof typeof Endpoint];
const endpoints = new Map<string, { name: Endpoint; pattern: RegExp }>([
  ["openai", { name: Endpoint.OPENAI, pattern: /^https:\/\/api\.openai\.com\/v1\/?$/ }],
  ["openai-codex", { name: Endpoint.CODEX, pattern: /^https:\/\/chatgpt\.com\/backend-api(?:\/codex)?\/?$/ }],
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

function hostedFeatureRestriction(
  feature: typeof Feature.WEB_SEARCH | typeof Feature.SERVICE_TIER,
  model: RequestModel,
  id: string,
): string | undefined {
  const host = endpoint(model);
  if (host !== Endpoint.OPENAI && host !== Endpoint.CODEX) {
    return "Native feature support is unverified on this endpoint";
  }
  if (feature === Feature.SERVICE_TIER && id.endsWith("-pro")) {
    return "Priority processing support is unverified for this model";
  }
  return undefined;
}

function safeRestriction(feature: Feature, settings: Settings, model: RequestModel): string | undefined {
  if (endpoint(model) === undefined) {
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
  return hostedFeatureRestriction(feature, model, id);
}

function inactive(feature: Feature, settings: Settings): boolean {
  const value = settings[feature];
  return value === null || value === false || value === ServiceTier.DEFAULT;
}

function action(feature: Feature, settings: Settings, format: RequestFormat): string {
  const descriptions = {
    verbosity: format === RequestFormat.RESPONSES ? "Set text.verbosity" : "Set verbosity",
    reasoningSummary:
      settings.reasoningSummary === ReasoningSummary.NONE ? "Remove reasoning.summary" : "Set reasoning.summary",
    webSearch: "Add native web search if absent",
    serviceTier: "Set service_tier to priority",
  };
  return descriptions[feature];
}

export function featureDecision(feature: Feature, settings: Settings, model: RequestModel | undefined): Decision {
  if (!settings.enabled) {
    return { apply: false, description: "Disabled: leave unchanged" };
  }
  if (inactive(feature, settings)) {
    return { apply: false, description: "Leave unchanged" };
  }
  if (!model) {
    return { apply: false, description: "Skipped: no model selected" };
  }
  const format = requestFormat(model);
  if (!format || (format === RequestFormat.COMPLETIONS && feature !== Feature.VERBOSITY)) {
    return { apply: false, description: "Skipped: unsupported API format" };
  }
  const restriction = settings.allowUnsupported ? undefined : safeRestriction(feature, settings, model);
  if (restriction) {
    return { apply: false, description: `Skipped: ${restriction}` };
  }
  const suffix = settings.allowUnsupported ? " (support checks bypassed)" : "";
  return { apply: true, description: action(feature, settings, format) + suffix };
}
