import { expect, test } from "vitest";
import { supportsModel } from "#openai-settings/responses-boundary";

test.each([
	["openai", "openai-responses", true],
	["azure", "azure-openai-responses", true],
	["github-copilot", "openai-responses", true],
	["openai", "openai-completions", false],
	["openai", "openai-codex-responses", false],
	["azure", "openai-responses", false],
	["github-copilot", "azure-openai-responses", false],
	["github-copilot", "anthropic-messages", false],
	["openrouter", "openai-responses", false],
	["custom", "azure-openai-responses", false],
])("provider %s with API %s is supported: %s", (provider, api, expected) => {
	// Arrange
	const model = { provider, api };
	// Act
	const supported = supportsModel(model);
	// Assert
	expect(supported).toBe(expected);
});

test("missing models are unsupported", () => {
	// Arrange / Act / Assert
	expect(supportsModel(undefined)).toBe(false);
});
