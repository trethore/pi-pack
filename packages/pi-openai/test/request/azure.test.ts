import { expect, it } from "vitest";
import { featureDecision } from "#src/request/compatibility";
import { transformPayload } from "#src/request/payload";
import { model, settings } from "#test/support";

const azure = {
  ...model,
  id: "gpt-5.5",
  provider: "azure",
  api: "azure-openai-responses",
  baseUrl: "https://example.openai.azure.com",
};
const active = settings({ verbosity: "low", reasoningSummary: "auto", webSearch: true, serviceTier: "priority" });

it.each([
  [undefined, azure.id],
  ["", azure.id],
  ["gpt-6-sol=other-deployment", azure.id],
  ["gpt-5.5=production-assistant", "production-assistant"],
  [" gpt-6-sol = other , gpt-5.5 = production-assistant ", "production-assistant"],
  ["invalid,=missing-model,gpt-5.5=,gpt-5.5=production-assistant", "production-assistant"],
  ["gpt-5.5=previous,gpt-5.5=production-assistant", "production-assistant"],
  ["gpt-5.5=production-assistant,gpt-5.5= ", "production-assistant"],
  ["gpt-5.5=production-assistant=ignored", "production-assistant"],
])("matches Pi's deployment mapping %j without changing the outgoing model", (mapping, deployment) => {
  // Arrange
  const payload = Object.freeze({ model: deployment, input: [] });

  // Act
  const result = transformPayload(payload, active, azure, mapping);

  // Assert
  expect(result).toEqual({
    ...payload,
    text: { verbosity: "low" },
    reasoning: { summary: "auto" },
    tools: [{ type: "web_search" }],
    service_tier: "priority",
  });
  expect(payload).not.toHaveProperty("text");
});

it.each([false, true])("rejects unexpected deployments with allowUnsupported=%s", (allowUnsupported) => {
  // Arrange
  const deploymentNameMap = "gpt-5.5=production-assistant,gpt-6-sol=other";

  // Act / Assert
  for (const id of [azure.id, "other", "request-only-deployment", undefined]) {
    expect(
      transformPayload({ model: id, input: [] }, { ...active, allowUnsupported }, azure, deploymentNameMap),
    ).toBeUndefined();
  }
});

it.each([
  { provider: "openai", api: "openai-responses" },
  { provider: "custom", api: "azure-openai-responses" },
  { provider: "azure", api: "openai-responses" },
  { provider: "azure", api: "unknown-api" },
])("does not apply Azure mappings to $provider / $api", (identity) => {
  // Arrange
  const requestModel = { ...azure, ...identity };
  const deploymentNameMap = "gpt-5.5=production-assistant";
  const overrides = { ...active, allowUnsupported: true };

  // Act / Assert
  expect(
    transformPayload({ model: "production-assistant", input: [] }, overrides, requestModel, deploymentNameMap),
  ).toBeUndefined();
  expect(transformPayload({ model: azure.id, input: [] }, overrides, requestModel, deploymentNameMap)).toHaveProperty(
    "text.verbosity",
    "low",
  );
});

it("checks support against the selected model rather than its deployment alias", () => {
  // Arrange
  const requestModel = { ...azure, id: "gpt-5.5-pro" };
  const payload = { model: "gpt-5.5", input: [] };
  const deploymentNameMap = "gpt-5.5-pro=gpt-5.5";

  // Act / Assert
  expect(transformPayload(payload, active, requestModel, deploymentNameMap)).toBeUndefined();
  expect(
    transformPayload(payload, { ...active, allowUnsupported: true }, requestModel, deploymentNameMap),
  ).toHaveProperty("text.verbosity", "low");
});

it("resolves a dated model's exact mapping before normalizing its support checks", () => {
  // Arrange
  const requestModel = { ...azure, id: "gpt-5.5-2026-04-23" };
  const payload = { model: "snapshot-deployment", input: [] };
  const deploymentNameMap = "gpt-5.5=alias-deployment,gpt-5.5-2026-04-23=snapshot-deployment";

  // Act / Assert
  expect(transformPayload(payload, active, requestModel, deploymentNameMap)).toHaveProperty("text.verbosity", "low");
  expect(
    transformPayload({ ...payload, model: "alias-deployment" }, active, requestModel, deploymentNameMap),
  ).toBeUndefined();
});

it.each([{ input: [], messages: [] }, { input: 42 }, { messages: [] }, {}])(
  "preserves payload format safeguards for mapped Azure requests: %j",
  (shape) => {
    // Arrange
    const payload = { model: "production-assistant", ...shape };
    const deploymentNameMap = "gpt-5.5=production-assistant";

    // Act / Assert
    expect(transformPayload(payload, active, azure, deploymentNameMap)).toBeUndefined();
  },
);

it.each([
  "gpt-5.5",
  "gpt-5.5-2026-04-24",
  "gpt-5.6-sol",
  "gpt-5.6-sol-2026-07-09",
  "gpt-5.6-terra",
  "gpt-5.6-terra-2026-07-09",
  "gpt-6-sol",
  "gpt-6-sol-2026-09-22",
])("requests priority for documented Azure model %s", (id) => {
  // Arrange
  const requestModel = { ...azure, id };
  const payload = { model: "production-assistant", input: [] };

  // Act
  const result = transformPayload(payload, active, requestModel, `${id}=production-assistant`);

  // Assert
  expect(result).toHaveProperty("service_tier", "priority");
  expect(featureDecision("serviceTier", active, requestModel)).toEqual({
    apply: true,
    description: "Set service_tier to priority",
  });
});

it.each(["gpt-5.6-luna", "gpt-6-astra", "gpt-6-luna", "gpt-6.1-sol", "gpt-6.1-sol-2026-10-01"])(
  "skips unverified Azure priority for %s without blocking other features",
  (id) => {
    // Arrange
    const requestModel = { ...azure, id };
    const payload = { model: "production-assistant", input: [], service_tier: "auto" };
    const mapping = `${id}=production-assistant`;

    // Act
    const result = transformPayload(payload, active, requestModel, mapping);
    const bypassed = transformPayload(payload, { ...active, allowUnsupported: true }, requestModel, mapping);

    // Assert
    expect(result).toEqual({
      ...payload,
      text: { verbosity: "low" },
      reasoning: { summary: "auto" },
      tools: [{ type: "web_search" }],
    });
    expect(featureDecision("serviceTier", active, requestModel)).toEqual({
      apply: false,
      description: "Skipped: Priority processing support is unverified for this Azure model",
    });
    expect(bypassed).toHaveProperty("service_tier", "priority");
  },
);
