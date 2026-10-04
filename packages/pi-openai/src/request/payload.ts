import { Feature, RequestFormat, featureDecision, requestFormat, type RequestModel } from "#src/request/compatibility";
import { ReasoningSummary, ServiceTier } from "#src/constants";
import type { Settings } from "#src/config/settings";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setVerbosity(payload: Record<string, unknown>, settings: Settings, format: RequestFormat): void {
  if (format === RequestFormat.COMPLETIONS) {
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

function payloadFormat(payload: Record<string, unknown>): RequestFormat | undefined {
  if ((Array.isArray(payload.input) || typeof payload.input === "string") && !("messages" in payload)) {
    return RequestFormat.RESPONSES;
  }
  if (Array.isArray(payload.messages) && !("input" in payload)) {
    return RequestFormat.COMPLETIONS;
  }
  return undefined;
}

function requestModelId(model: RequestModel, deploymentNameMap: string | undefined): string {
  if (model.provider !== "azure-openai-responses" || model.api !== "azure-openai-responses") {
    return model.id;
  }
  // Match Pi's deployment-map parsing. Request-scoped overrides are not exposed to extensions.
  const deployments = new Map<string, string>();
  for (const entry of deploymentNameMap?.split(",") ?? []) {
    const [id, deployment] = entry.trim().split("=", 2);
    if (id && deployment) {
      deployments.set(id.trim(), deployment.trim());
    }
  }
  return deployments.get(model.id) || model.id;
}

function matchingRequestFormat(
  payload: Record<string, unknown>,
  settings: Settings,
  model: RequestModel,
  deploymentNameMap: string | undefined,
): RequestFormat | undefined {
  // Pi exposes the selected model, which may differ from a redirected request.
  if (payload.model !== requestModelId(model, deploymentNameMap)) {
    return undefined;
  }
  const format = payloadFormat(payload);
  if (!settings.allowUnsupported && format !== requestFormat(model)) {
    return undefined;
  }
  return format;
}

export function transformPayload(
  payload: unknown,
  settings: Settings,
  model: RequestModel | undefined,
  deploymentNameMap?: string,
): unknown {
  if (!settings.enabled || !model || !isObject(payload)) {
    return undefined;
  }
  const format = matchingRequestFormat(payload, settings, model, deploymentNameMap);
  if (!format) {
    return undefined;
  }
  const result = { ...payload };

  if (featureDecision(Feature.VERBOSITY, settings, model, format).apply) {
    setVerbosity(result, settings, format);
  }
  if (featureDecision(Feature.REASONING_SUMMARY, settings, model, format).apply) {
    setSummary(result, settings);
  }
  if (featureDecision(Feature.WEB_SEARCH, settings, model, format).apply) {
    addWebSearch(result);
  }
  if (featureDecision(Feature.SERVICE_TIER, settings, model, format).apply) {
    result.service_tier = ServiceTier.PRIORITY;
  }
  return Object.keys(result).some((key) => result[key] !== payload[key]) ? result : undefined;
}
