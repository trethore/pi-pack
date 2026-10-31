import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createExtensionHarness } from "#test/extension-harness";
import openaiSettings from "#openai-settings/index";

export function model(provider = "openai", api = "openai-responses"): NonNullable<ExtensionContext["model"]> {
	return {
		id: "test-model",
		name: "Test model",
		provider,
		api,
		baseUrl: "https://example.invalid/v1",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16000,
	};
}

export function setup(source?: string, selectedModel: ExtensionContext["model"] = model()) {
	return createExtensionHarness(openaiSettings, "pi-openai-settings.jsonc", { model: selectedModel }, source);
}
