import { describe, expect, it } from "vitest";
import { RequestFormat, featureDecision, type Feature, type RequestModel } from "#src/request/compatibility";
import { transformPayload } from "#src/request/payload";
import type { Settings } from "#src/config/settings";
import { model, settings } from "#test/support";

const active = settings({ verbosity: "low", reasoningSummary: "auto", webSearch: true, serviceTier: "priority" });

function payloadFor(requestModel = model): Record<string, unknown> {
  return { model: requestModel.id, input: [], stream: true, store: false };
}

it.each(["fast", "priority"])("does not change an existing %s tier with default settings", (tier) => {
  // Arrange
  const payload = {
    ...payloadFor(),
    text: { verbosity: "high" },
    reasoning: { summary: "auto" },
    service_tier: tier,
  };

  // Act / Assert
  expect(transformPayload(payload, settings(), model)).toBeUndefined();
});

it.each([
  { provider: "openai", api: "openai-responses", baseUrl: "https://api.openai.com/v1" },
  { provider: "azure", api: "azure-openai-responses", baseUrl: "https://example.openai.azure.com" },
  {
    provider: "azure",
    api: "azure-openai-responses",
    baseUrl: "https://example.services.ai.azure.com/openai/v1/",
  },
])("changes supported $provider Responses fields without mutating or losing unrelated data", (overrides) => {
  // Arrange
  const requestModel = { ...model, ...overrides };
  const text = Object.freeze({ format: { type: "json_object" }, verbosity: "high" });
  const reasoning = Object.freeze({ effort: "high", summary: "detailed" });
  const tools = Object.freeze([{ type: "function", name: "read" }]);
  const payload = Object.freeze({
    ...payloadFor(requestModel),
    text,
    reasoning,
    tools,
    include: ["reasoning.encrypted_content"],
    prompt_cache_key: "session",
    tool_choice: "auto",
  });

  // Act
  const result = transformPayload(payload, active, requestModel);

  // Assert
  expect(result).toEqual({
    ...payload,
    text: { ...text, verbosity: "low" },
    reasoning: { ...reasoning, summary: "auto" },
    tools: [...tools, { type: "web_search" }],
    service_tier: "priority",
  });
  expect(payload.text.verbosity).toBe("high");
  expect(payload.reasoning.summary).toBe("detailed");
  expect(payload.tools).toHaveLength(1);
});

it("adds only the requested fields to a minimal request", () => {
  // Act
  const result = transformPayload(payloadFor(), active, model);

  // Assert
  expect(result).toEqual({
    ...payloadFor(),
    text: { verbosity: "low" },
    reasoning: { summary: "auto" },
    tools: [{ type: "web_search" }],
    service_tier: "priority",
  });
  expect(result).not.toHaveProperty("temperature");
  expect(result).not.toHaveProperty("max_output_tokens");
  expect(result).not.toHaveProperty("reasoning.effort");
});

it("removes summaries without removing reasoning effort or encrypted reasoning", () => {
  // Arrange
  const payload = {
    ...payloadFor(),
    reasoning: { summary: "auto", effort: "high" },
    include: ["reasoning.encrypted_content"],
  };

  // Act
  const result = transformPayload(payload, settings({ reasoningSummary: "none" }), model);

  // Assert
  expect(result).toEqual({ ...payload, reasoning: { effort: "high" } });
  expect(payload.reasoning.summary).toBe("auto");
});

it("does not create reasoning when removing an absent summary", () => {
  // Act / Assert
  expect(transformPayload(payloadFor(), settings({ reasoningSummary: "none" }), model)).toBeUndefined();
});

it.each(["web_search", "web_search_preview", "web_search_preview_2025_03_11", "web_search_2025_08_26"])(
  "preserves an existing %s tool and its options",
  (type) => {
    // Arrange
    const payload = {
      ...payloadFor(),
      tools: [{ type, search_context_size: "low", filters: { allowed_domains: ["example.com"] } }],
    };

    // Act / Assert
    expect(transformPayload(payload, settings({ webSearch: true }), model)).toBeUndefined();
    expect(payload.tools).toHaveLength(1);
  },
);

it("does not remove native tools when webSearch is false or force tool choice", () => {
  // Arrange
  const payload = { ...payloadFor(), tools: [{ type: "web_search" }], tool_choice: "none" };

  // Act / Assert
  expect(transformPayload(payload, settings({ webSearch: false }), model)).toBeUndefined();
  expect(transformPayload({ ...payload, tools: [] }, settings({ webSearch: true }), model)).toEqual({ ...payload });
});

it("sets top-level verbosity and skips Responses-only features on Chat Completions", () => {
  // Arrange
  const completions = { ...model, api: "openai-completions" };
  const payload = { model: model.id, messages: [], reasoning_effort: "high" };

  // Act
  const result = transformPayload(payload, active, completions);

  // Assert
  expect(result).toEqual({ ...payload, verbosity: "low" });
  expect(transformPayload(payload, { ...active, allowUnsupported: true }, completions)).toEqual(result);
});

it.each([
  { provider: "github-copilot", baseUrl: "https://api.individual.githubcopilot.com" },
  { provider: "github-copilot", baseUrl: "https://api.githubcopilot.com" },
  { provider: "github-copilot", baseUrl: "https://api.business.githubcopilot.com" },
  { provider: "github-copilot", baseUrl: "https://api.enterprise.githubcopilot.com" },
])("applies parameter overrides but not native features on $provider", (overrides) => {
  // Arrange
  const requestModel = { ...model, ...overrides };

  // Act
  const result = transformPayload(payloadFor(requestModel), active, requestModel);

  // Assert
  expect(result).toEqual({ ...payloadFor(requestModel), text: { verbosity: "low" }, reasoning: { summary: "auto" } });
  for (const feature of ["webSearch", "serviceTier"] as const) {
    expect(featureDecision(feature, active, requestModel)).toEqual({
      apply: false,
      description: "Skipped: Native feature support is unverified on this endpoint",
    });
  }
  expect(transformPayload(payloadFor(requestModel), { ...active, allowUnsupported: true }, requestModel)).toMatchObject(
    {
      tools: [{ type: "web_search" }],
      service_tier: "priority",
    },
  );
});

it.each([
  {
    provider: "openai-codex",
    api: "openai-codex-responses",
    baseUrl: "https://chatgpt.com/backend-api",
  },
  { provider: "openai", api: "openai-codex-responses", baseUrl: "https://api.openai.com/v1" },
  { provider: "openai-codex", api: "openai-responses", baseUrl: "https://chatgpt.com/backend-api/codex" },
])("requires allowUnsupported for $provider / $api", (overrides) => {
  // Arrange
  const requestModel = { ...model, ...overrides };
  const payload = payloadFor(requestModel);

  // Act
  const result = transformPayload(payload, active, requestModel);
  const bypassed = transformPayload(payload, { ...active, allowUnsupported: true }, requestModel);

  // Assert
  expect(result).toBeUndefined();
  expect(featureDecision("verbosity", active, requestModel).apply).toBe(false);
  expect(bypassed).toEqual({
    ...payload,
    text: { verbosity: "low" },
    reasoning: { summary: "auto" },
    tools: [{ type: "web_search" }],
    service_tier: "priority",
  });
});

it.each([
  { model: model.id, input: 42 },
  { model: model.id, input: [], messages: [] },
  { model: "some-other-model", input: [] },
])("preserves payload safeguards for legacy requests with allowUnsupported: %j", (payload) => {
  // Arrange
  const legacy = {
    ...model,
    provider: "openai-codex",
    api: "openai-codex-responses",
    baseUrl: "https://chatgpt.com/backend-api",
  };

  // Act
  const result = transformPayload(payload, { ...active, allowUnsupported: true }, legacy);

  // Assert
  expect(result).toBeUndefined();
});

it("requires allowUnsupported for a custom endpoint even with an OpenAI model ID", () => {
  // Arrange
  const custom = { ...model, baseUrl: "https://gateway.example/v1" };

  // Act / Assert
  expect(transformPayload(payloadFor(), active, custom)).toBeUndefined();
  expect(transformPayload(payloadFor(), { ...active, allowUnsupported: true }, custom)).toEqual(
    transformPayload(payloadFor(), active, model),
  );
});

it("bypasses provider and model metadata restrictions only when explicitly requested", () => {
  // Arrange
  const custom = { ...model, provider: "custom", id: "deployment-name", reasoning: false };

  // Act / Assert
  expect(transformPayload(payloadFor(custom), active, custom)).toBeUndefined();
  expect(transformPayload(payloadFor(custom), { ...active, allowUnsupported: true }, custom)).toHaveProperty(
    "reasoning.summary",
    "auto",
  );
});

it.each([
  undefined,
  null,
  [],
  "text",
  {},
  { input: [] },
  { model: model.id },
  { model: model.id, input: 42 },
  { model: model.id, messages: "Hello" },
  { model: model.id, input: [], messages: [] },
  { model: model.id, contents: [] },
  { model: "some-other-model", input: [] },
])("ignores malformed or mismatched payload %j even with the bypass", (payload) => {
  // Act / Assert
  expect(transformPayload(payload, { ...active, allowUnsupported: true }, model)).toBeUndefined();
  expect(
    transformPayload(payload, { ...active, allowUnsupported: true }, { ...model, api: "unknown-api" }),
  ).toBeUndefined();
});

describe.each(["anthropic-messages", "google-generative-ai", "unknown-api", "openai-responses", "openai-completions"])(
  "unsafe payload inference for %s",
  (api) => {
    const custom = {
      ...model,
      api,
      provider: "custom",
      baseUrl: "https://gateway.example/v1",
      id: "deployment-name",
      reasoning: false,
    };

    it.each([{ input: [] }, { input: "Hello" }])("infers Responses format from input $input", ({ input }) => {
      // Arrange
      const payload = Object.freeze({ ...payloadFor(custom), input });

      // Act
      const result = transformPayload(payload, { ...active, allowUnsupported: true }, custom);

      // Assert
      expect(transformPayload(payload, active, custom)).toBeUndefined();
      expect(result).toEqual({
        ...payload,
        text: { verbosity: "low" },
        reasoning: { summary: "auto" },
        tools: [{ type: "web_search" }],
        service_tier: "priority",
      });
      expect(payload).not.toHaveProperty("text");
    });

    it("infers Completions format and only changes verbosity", () => {
      // Arrange
      const payload = Object.freeze({ model: custom.id, messages: [], reasoning_effort: "high" });

      // Act
      const result = transformPayload(payload, { ...active, allowUnsupported: true }, custom);

      // Assert
      expect(transformPayload(payload, active, custom)).toBeUndefined();
      expect(result).toEqual({ ...payload, verbosity: "low" });
      expect(payload).not.toHaveProperty("verbosity");
    });

    it("leaves inactive and disabled overrides unchanged", () => {
      // Arrange
      const payload = payloadFor(custom);

      // Act / Assert
      expect(transformPayload(payload, settings({ allowUnsupported: true }), custom)).toBeUndefined();
      expect(transformPayload(payload, { ...active, enabled: false, allowUnsupported: true }, custom)).toBeUndefined();
      expect(transformPayload(payload, { ...active, allowUnsupported: true }, undefined)).toBeUndefined();
    });
  },
);

it.each(["openai-responses", "openai-completions"])(
  "requires the unsafe flag when the payload disagrees with the declared %s API",
  (api) => {
    // Arrange
    const requestModel = { ...model, api };
    const payload = api === "openai-responses" ? { model: model.id, messages: [] } : payloadFor();

    // Act
    const result = transformPayload(payload, active, requestModel);
    const bypassed = transformPayload(payload, { ...active, allowUnsupported: true }, requestModel);

    // Assert
    expect(result).toBeUndefined();
    expect(bypassed).toHaveProperty(api === "openai-responses" ? "verbosity" : "text.verbosity", "low");
  },
);

it.each(["anthropic-messages", "google-generative-ai", "unknown-api"])(
  "rejects an unverified %s API by default even on a supported provider and model",
  (api) => {
    // Act / Assert
    expect(transformPayload(payloadFor(), active, { ...model, api })).toBeUndefined();
  },
);

it("does not guess the target when the physical and selected models differ", () => {
  // Arrange
  const payload = { ...payloadFor(), model: "some-other-model" };

  // Act / Assert
  expect(transformPayload(payload, { ...active, allowUnsupported: true }, model)).toBeUndefined();
  expect(transformPayload(payloadFor(), active, undefined)).toBeUndefined();
});

it("leaves unrecognized nested field shapes intact", () => {
  // Arrange
  const payload = { ...payloadFor(), text: null, reasoning: [], tools: "custom" };

  // Act / Assert
  expect(transformPayload(payload, { ...active, serviceTier: "default" }, model)).toBeUndefined();
  expect(
    transformPayload(
      payload,
      { ...active, serviceTier: "default", allowUnsupported: true },
      { ...model, api: "unknown-api" },
    ),
  ).toBeUndefined();
});

it("disabled overrides win over the unsupported bypass", () => {
  // Act / Assert
  expect(transformPayload(payloadFor(), { ...active, enabled: false, allowUnsupported: true }, model)).toBeUndefined();
});

const restrictions: Array<[Feature, Partial<Settings>, Partial<RequestModel>, string]> = [
  ["verbosity", {}, { id: "gpt-99" }, "Model support is limited to known GPT-5.5 and newer models"],
  ["verbosity", {}, { baseUrl: "https://api.openai.com.evil.example/v1" }, "endpoint support is unverified"],
  ["verbosity", {}, { baseUrl: "invalid" }, "endpoint support is unverified"],
  ["reasoningSummary", {}, { reasoning: false }, "not reasoning-capable"],
  ["reasoningSummary", { reasoningSummary: "concise" }, {}, "Concise summary support is unverified"],
  ["serviceTier", {}, { id: "gpt-5.5-pro" }, "Model support is limited to known GPT-5.5 and newer models"],
];

describe("compatibility decisions", () => {
  it.each(restrictions)("explains why %s is skipped for %j / %j", (feature, override, modelOverride, reason) => {
    // Act
    const decision = featureDecision(feature, { ...active, ...override }, { ...model, ...modelOverride });

    // Assert
    expect(decision.apply).toBe(false);
    expect(decision.description).toContain(reason);
    expect(
      featureDecision(
        feature,
        { ...active, ...override, allowUnsupported: true },
        { ...model, ...modelOverride },
        RequestFormat.RESPONSES,
      ).apply,
    ).toBe(true);
  });

  it.each([
    "gpt-5.5",
    "gpt-5.5-2026-04-23",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-astra",
    "gpt-6-luna",
    "gpt-6-sol",
    "gpt-6.1-sol",
  ])("recognizes modern model %s across all features", (id) => {
    // Arrange
    const requestModel = { ...model, id };

    // Act
    const result = transformPayload(payloadFor(requestModel), active, requestModel);

    // Assert
    expect(result).toMatchObject({
      text: { verbosity: "low" },
      reasoning: { summary: "auto" },
      tools: [{ type: "web_search" }],
      service_tier: "priority",
    });
  });

  it.each([
    "gpt-5.5-pro",
    "gpt-5.5-pro-2026-04-23",
    "gpt-4o",
    "gpt-4.1",
    "o1",
    "o3",
    "o3-mini",
    "o3-pro",
    "o4-mini",
    "computer-use-preview",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5.1",
    "gpt-5.2",
    "gpt-5.3-codex",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-2026-03-05",
  ])("leaves unlisted model %s unchanged unless support checks are explicitly bypassed", (id) => {
    // Arrange
    const unlisted = { ...model, id };
    const payload = { ...payloadFor(unlisted), reasoning: { effort: "high", summary: "auto" } };

    // Act / Assert
    expect(transformPayload(payload, active, unlisted)).toBeUndefined();
    expect(transformPayload(payload, { ...active, reasoningSummary: "none" }, unlisted)).toBeUndefined();
    expect(transformPayload(payload, { ...active, allowUnsupported: true }, unlisted)).toHaveProperty(
      "text.verbosity",
      "low",
    );
    expect(transformPayload(payload, settings({ reasoningSummary: "none", allowUnsupported: true }), unlisted)).toEqual(
      {
        ...payload,
        reasoning: { effort: "high" },
      },
    );
    expect(featureDecision("webSearch", active, unlisted).description).toContain("GPT-5.5 and newer");
  });
});

it("supports Responses requests with a string input", () => {
  // Arrange
  const payload = { model: model.id, input: "Hello" };

  // Act / Assert
  expect(transformPayload(payload, settings({ verbosity: "low" }), model)).toEqual({
    ...payload,
    text: { verbosity: "low" },
  });
});
