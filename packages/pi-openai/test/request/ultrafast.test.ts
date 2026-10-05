import { expect, it } from "vitest";
import { ServiceTier, Feature, Verbosity, ReasoningSummary } from "#src/constants";
import { featureDecision, RequestFormat } from "#src/request/compatibility";
import { transformPayload } from "#src/request/payload";
import { model, settings } from "#test/support";

const astra = { ...model, id: "gpt-6-astra" };
const ultrafast = settings({ serviceTier: ServiceTier.ULTRAFAST });

it.each(["gpt-6-astra", "gpt-6-astra-2026-10-01"])("requests ultrafast for OpenAI %s", (id) => {
  // Arrange
  const requestModel = { ...astra, id };
  const payload = Object.freeze({ model: id, input: [], service_tier: "priority" });

  // Act
  const result = transformPayload(payload, ultrafast, requestModel);

  // Assert
  expect(result).toEqual({ ...payload, service_tier: "ultrafast" });
  expect(payload.service_tier).toBe("priority");
  expect(featureDecision(Feature.SERVICE_TIER, ultrafast, requestModel)).toEqual({
    apply: true,
    description: "Set service_tier to ultrafast",
  });
  expect(transformPayload(result, ultrafast, requestModel)).toBeUndefined();
});

it.each([
  "gpt-5.5",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-6-luna",
  "gpt-6-sol",
  "gpt-6.1-sol",
  "gpt-6.1-sol-2026-10-01",
])("skips ultrafast for %s without changing its existing tier or blocking other settings", (id) => {
  // Arrange
  const requestModel = { ...model, id };
  const payload = { model: id, input: [], service_tier: "auto" };
  const active = {
    ...ultrafast,
    verbosity: Verbosity.LOW,
    reasoningSummary: ReasoningSummary.AUTO,
    webSearch: true,
  } as const;

  // Act
  const result = transformPayload(payload, active, requestModel);
  const bypassed = transformPayload(payload, { ...active, allowUnsupported: true }, requestModel);

  // Assert
  expect(result).toEqual({
    ...payload,
    text: { verbosity: "low" },
    reasoning: { summary: "auto" },
    tools: [{ type: "web_search" }],
  });
  expect(featureDecision(Feature.SERVICE_TIER, active, requestModel)).toEqual({
    apply: false,
    description: "Skipped: Ultrafast support is unverified for this model",
  });
  expect(bypassed).toHaveProperty("service_tier", "ultrafast");
});

it.each([
  { provider: "azure", api: "azure-openai-responses", baseUrl: "https://example.openai.azure.com" },
  { provider: "azure", api: "azure-openai-responses", baseUrl: "https://example.services.ai.azure.com/openai/v1/" },
  { provider: "github-copilot", api: "openai-responses", baseUrl: "https://api.githubcopilot.com" },
  { provider: "github-copilot", api: "openai-responses", baseUrl: "https://api.individual.githubcopilot.com" },
])("requires the bypass for Astra ultrafast on $baseUrl", (identity) => {
  // Arrange
  const requestModel = { ...astra, ...identity };
  const deploymentNameMap = identity.provider === "azure" ? `${astra.id}=production-assistant` : undefined;
  const payload = { model: deploymentNameMap ? "production-assistant" : astra.id, input: [], service_tier: "auto" };

  // Act
  const result = transformPayload(payload, ultrafast, requestModel, deploymentNameMap);
  const bypassed = transformPayload(payload, { ...ultrafast, allowUnsupported: true }, requestModel, deploymentNameMap);

  // Assert
  expect(result).toBeUndefined();
  expect(featureDecision(Feature.SERVICE_TIER, ultrafast, requestModel)).toEqual({
    apply: false,
    description: "Skipped: Ultrafast support is unverified on this endpoint",
  });
  expect(bypassed).toEqual({ ...payload, service_tier: "ultrafast" });
});

it.each([
  { id: "gpt-6-astra-preview" },
  { id: "gpt-6-astra-2026-10-01-extra" },
  { id: "gpt-99" },
  { baseUrl: "https://gateway.example/v1" },
  { baseUrl: "https://api.openai.com.evil.example/v1" },
  { provider: "custom" },
  { api: "unknown-api" },
  { provider: "openai-codex", api: "openai-codex-responses", baseUrl: "https://chatgpt.com/backend-api" },
])("preserves general support checks for ultrafast: %j", (identity) => {
  // Arrange
  const requestModel = { ...astra, ...identity };
  const payload = { model: requestModel.id, input: "Hello" };

  // Act / Assert
  expect(transformPayload(payload, ultrafast, requestModel)).toBeUndefined();
  expect(transformPayload(payload, { ...ultrafast, allowUnsupported: true }, requestModel)).toEqual({
    ...payload,
    service_tier: "ultrafast",
  });
});

it.each([false, true])("keeps ultrafast Responses-only with allowUnsupported=%s", (allowUnsupported) => {
  // Arrange
  const requestModel = { ...astra, api: "openai-completions" };
  const payload = { model: astra.id, messages: [], service_tier: "auto" };
  const active = { ...ultrafast, allowUnsupported };

  // Act / Assert
  expect(transformPayload(payload, active, requestModel)).toBeUndefined();
  expect(featureDecision(Feature.SERVICE_TIER, active, requestModel, RequestFormat.COMPLETIONS)).toEqual({
    apply: false,
    description: "Skipped: requires a Responses payload",
  });
});

it.each([false, true])(
  "preserves payload and disabled-setting safeguards with allowUnsupported=%s",
  (allowUnsupported) => {
    // Arrange
    const active = { ...ultrafast, allowUnsupported };
    const payload = { model: astra.id, input: [] };

    // Act / Assert
    expect(transformPayload({ ...payload, model: model.id }, active, astra)).toBeUndefined();
    expect(transformPayload({ ...payload, messages: [] }, active, astra)).toBeUndefined();
    expect(transformPayload({ ...payload, input: 42 }, active, astra)).toBeUndefined();
    expect(transformPayload(payload, active, undefined)).toBeUndefined();
    expect(transformPayload(payload, { ...active, enabled: false }, astra)).toBeUndefined();
    expect(transformPayload(payload, { ...active, serviceTier: ServiceTier.DEFAULT }, astra)).toBeUndefined();
  },
);
