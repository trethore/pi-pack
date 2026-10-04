import { Feature, RequestFormat, featureDecision, requestFormat, type RequestModel } from "#src/compatibility";
import { ReasoningSummary, ServiceTier } from "#src/constants";
import type { Settings } from "#src/settings";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setVerbosity(payload: Record<string, unknown>, settings: Settings, model: RequestModel): void {
  if (requestFormat(model) === RequestFormat.COMPLETIONS) {
    payload.verbosity = settings.verbosity;
  } else if (payload.text === undefined || isObject(payload.text)) {
    payload.text = { ...payload.text, verbosity: settings.verbosity };
  }
}

function setSummary(payload: Record<string, unknown>, settings: Settings): void {
  if (payload.reasoning !== undefined && !isObject(payload.reasoning)) {
    return;
  }
  const reasoning = { ...payload.reasoning };
  if (settings.reasoningSummary === ReasoningSummary.NONE) {
    if (!("summary" in reasoning)) {
      return;
    }
    delete reasoning.summary;
  } else {
    reasoning.summary = settings.reasoningSummary;
  }
  payload.reasoning = reasoning;
}

function addWebSearch(payload: Record<string, unknown>): void {
  if (payload.tools !== undefined && !Array.isArray(payload.tools)) {
    return;
  }
  const tools: unknown[] = payload.tools ?? [];
  const exists = tools.some(
    (tool) =>
      isObject(tool) &&
      typeof tool.type === "string" &&
      /^web_search(?:_preview)?(?:_\d{4}_\d{2}_\d{2})?$/.test(tool.type),
  );
  if (!exists) {
    payload.tools = [...tools, { type: "web_search" }];
  }
}

export function matchesRequest(payload: unknown, model: RequestModel): payload is Record<string, unknown> {
  if (!isObject(payload) || payload.model !== model.id) {
    return false;
  }
  const format = requestFormat(model);
  if (format === RequestFormat.RESPONSES) {
    return (Array.isArray(payload.input) || typeof payload.input === "string") && !("messages" in payload);
  }
  if (format === RequestFormat.COMPLETIONS) {
    return Array.isArray(payload.messages) && !("input" in payload);
  }
  return false;
}

export function transformPayload(payload: unknown, settings: Settings, model: RequestModel | undefined): unknown {
  if (!settings.enabled || !model) {
    return undefined;
  }

  // Pi's extension hook exposes the selected model, not the physical request model.
  // Do not guess capabilities when another extension or virtual model redirects it.
  if (!matchesRequest(payload, model)) {
    return undefined;
  }
  const result = { ...payload };

  if (featureDecision(Feature.VERBOSITY, settings, model).apply) {
    setVerbosity(result, settings, model);
  }
  if (featureDecision(Feature.REASONING_SUMMARY, settings, model).apply) {
    setSummary(result, settings);
  }
  if (featureDecision(Feature.WEB_SEARCH, settings, model).apply) {
    addWebSearch(result);
  }
  if (featureDecision(Feature.SERVICE_TIER, settings, model).apply) {
    result.service_tier = ServiceTier.PRIORITY;
  }
  return Object.keys(result).some((key) => result[key] !== payload[key]) ? result : undefined;
}
