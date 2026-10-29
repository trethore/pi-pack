import { afterEach, expect, test, vi } from "vitest";
import { loadConfig } from "#openai-settings/config.ts";
import { applySettings, supportsModel } from "#openai-settings/payload.ts";
import { setup } from "#openai-settings-test/fixtures.ts";

afterEach(() => vi.unstubAllEnvs());

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

test("sets all fields while preserving format, reasoning effort, tools, and unrelated fields", () => {
	// Arrange
	setup(
		'{"verbosity":{"value":"low"},"reasoningSummary":{"value":"detailed"},"webSearch":{"value":true},"serviceTier":{"value":"priority"}}',
	);
	const config = loadConfig();
	const payload = {
		text: { format: { type: "json_object" }, verbosity: "high" },
		reasoning: { effort: "high", summary: "auto" },
		tools: [{ type: "function", name: "read" }],
		input: [],
		stream: true,
		service_tier: "default",
	};
	// Act
	applySettings(payload, config);
	// Assert
	expect(payload).toEqual({
		text: { format: { type: "json_object" }, verbosity: "low" },
		reasoning: { effort: "high", summary: "detailed" },
		tools: [{ type: "function", name: "read" }, { type: "web_search" }],
		input: [],
		stream: true,
		service_tier: "priority",
	});
});

test.each([
	"{}",
	'{"enabled":false,"verbosity":{"value":"low"},"reasoningSummary":{"value":"none"},"webSearch":{"value":false},"serviceTier":{"value":"ultrafast"}}',
])("defaults and a disabled master leave every field untouched: %s", (source) => {
	// Arrange
	setup(source);
	const payload = {
		text: { verbosity: "high" },
		reasoning: { summary: "auto" },
		tools: [{ type: "web_search" }],
		service_tier: "priority",
	};
	const original = structuredClone(payload);
	const tools = payload.tools;
	// Act
	applySettings(payload, loadConfig());
	// Assert
	expect(payload).toEqual(original);
	expect(payload.tools).toBe(tools);
});

test("creates missing nested payload fields", () => {
	// Arrange
	setup(
		'{"verbosity":{"value":"medium"},"reasoningSummary":{"value":"concise"},"webSearch":{"value":true},"serviceTier":{"value":"default"}}',
	);
	const payload = {};
	// Act
	applySettings(payload, loadConfig());
	// Assert
	expect(payload).toEqual({
		text: { verbosity: "medium" },
		reasoning: { summary: "concise" },
		tools: [{ type: "web_search" }],
		service_tier: "default",
	});
});

test("none deletes only reasoning.summary and never sends the sentinel", () => {
	// Arrange
	setup('{"reasoningSummary":{"value":"none"}}');
	const payload = { reasoning: { effort: "high", summary: "auto" }, include: ["reasoning.encrypted_content"] };
	// Act
	applySettings(payload, loadConfig());
	// Assert
	expect(payload).toEqual({ reasoning: { effort: "high" }, include: ["reasoning.encrypted_content"] });
});

test("removing absent summaries and web search does not introduce fields", () => {
	// Arrange
	setup('{"reasoningSummary":{"value":"none"},"webSearch":{"value":false}}');
	const payload = {};
	// Act
	applySettings(payload, loadConfig());
	// Assert
	expect(payload).toEqual({});
});

test.each(["web_search", "web_search_preview"])("does not duplicate or replace existing %s configuration", (type) => {
	// Arrange
	setup('{"webSearch":{"value":true}}');
	const tools = [
		{ type, search_context_size: "low" },
		{ type: "function", name: "read" },
	];
	const payload = { tools };
	// Act
	applySettings(payload, loadConfig());
	applySettings(payload, loadConfig());
	// Assert
	expect(payload.tools).toBe(tools);
	expect(payload.tools).toHaveLength(2);
});

test("false removes all web search declarations and preserves other tools", () => {
	// Arrange
	setup('{"webSearch":{"value":false}}');
	const tool = { type: "function", name: "read" };
	const payload = { tools: [{ type: "web_search" }, tool, { type: "web_search_preview" }, { type: "web_search" }] };
	// Act
	applySettings(payload, loadConfig());
	// Assert
	expect(payload.tools).toEqual([tool]);
	expect(payload.tools[0]).toBe(tool);
});

test.each([null, undefined, [], "payload", 5])("ignores non-object payloads: %j", (payload) => {
	// Arrange
	setup('{"verbosity":{"value":"high"}}');
	// Act / Assert
	expect(() => applySettings(payload, loadConfig())).not.toThrow();
});

test.each([
	{ text: null },
	{ text: "plain text" },
	{ text: [] },
	{ text: new Date(0) },
	{ reasoning: null },
	{ reasoning: false },
	{ reasoning: [] },
	{ reasoning: new Map() },
	{ tools: null },
	{ tools: {} },
	{ tools: "web_search" },
	{ tools: [null] },
	{ tools: [[]] },
	{ tools: ["web_search"] },
	{ tools: [{}] },
	{ tools: [{ type: 42 }] },
	{ tools: [{ type: "function" }, { name: "missing_type" }] },
])("leaves the entire payload untouched when its structure is invalid: %j", (invalidFields) => {
	// Arrange
	setup(
		'{"verbosity":{"value":"low"},"reasoningSummary":{"value":"none"},"webSearch":{"value":false},"serviceTier":{"value":"priority"}}',
	);
	const payload = {
		text: { verbosity: "high" },
		reasoning: { effort: "high", summary: "auto" },
		tools: [{ type: "web_search" }],
		service_tier: "default",
		...invalidFields,
	};
	const original = structuredClone(payload);
	const { text, reasoning, tools } = payload;

	// Act
	applySettings(payload, loadConfig());

	// Assert
	expect(payload).toEqual(original);
	expect(payload.text).toBe(text);
	expect(payload.reasoning).toBe(reasoning);
	expect(payload.tools).toBe(tools);
});

test.each([new Date(0), new Map(), new Set()])("does not modify non-plain payload objects: %j", (payload) => {
	// Arrange
	setup('{"verbosity":{"value":"high"}}');
	const original = structuredClone(payload);

	// Act
	applySettings(payload, loadConfig());

	// Assert
	expect(payload).toEqual(original);
	expect(Object.hasOwn(payload, "text")).toBe(false);
});

test("preserves unknown fields, tool types, and nested references while applying settings", () => {
	// Arrange
	setup('{"verbosity":{"value":"low"},"reasoningSummary":{"value":"none"},"webSearch":{"value":true}}');
	const format = { type: "future_format", options: { custom: true } };
	const metadata = { custom: ["value"] };
	const reasoning = { effort: "future_effort", summary: "auto", provider_option: metadata };
	const tool = { type: "future_tool", provider_option: metadata };
	const input = [{ role: "user", content: "Hello" }];
	const payload = { text: { format, provider_option: metadata }, reasoning, tools: [tool], input, metadata };

	// Act
	applySettings(payload, loadConfig());

	// Assert
	expect(payload).toEqual({
		text: { format, provider_option: metadata, verbosity: "low" },
		reasoning: { effort: "future_effort", provider_option: metadata },
		tools: [tool, { type: "web_search" }],
		input,
		metadata,
	});
	expect(payload.text.format).toBe(format);
	expect(payload.text.provider_option).toBe(metadata);
	expect(payload.reasoning).toBe(reasoning);
	expect(payload.tools[0]).toBe(tool);
	expect(payload.input).toBe(input);
	expect(payload.metadata).toBe(metadata);
});

test("accepts explicitly undefined optional payload fields", () => {
	// Arrange
	setup('{"verbosity":{"value":"low"},"reasoningSummary":{"value":"auto"},"webSearch":{"value":true}}');
	const payload = { text: undefined, reasoning: undefined, tools: undefined };

	// Act
	applySettings(payload, loadConfig());

	// Assert
	expect(payload).toEqual({
		text: { verbosity: "low" },
		reasoning: { summary: "auto" },
		tools: [{ type: "web_search" }],
	});
});
