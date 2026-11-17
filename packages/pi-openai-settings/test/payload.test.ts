/* eslint-disable unicorn/no-null -- Null is part of the payload and setting contracts. */
import { ResponsesPayload } from "#src/payload";
import { Fixtures } from "#test/fixtures";
import { expect, test } from "vitest";

const jsonObjectFormat = "json_object";
const webSearch = "web_search";
const webSearchPreview = "web_search_preview";
const webSearchTypes = [webSearch, webSearchPreview, "web_search_preview_2025_03_11", "web_search_2025_08_26"];

test.each([
	["openai", Fixtures.model.api, true],
	["github-copilot", Fixtures.model.api, true],
	["azure", "azure-openai-responses", true],
	["openai", "openai-completions", false],
	["azure", Fixtures.model.api, false],
	["github-copilot", "azure-openai-responses", false],
	["openai-codex", "openai-codex-responses", false],
	["custom", Fixtures.model.api, false],
])("checks the exact provider/API pair %s/%s", (provider, api, expected) => {
	expect.hasAssertions();
	// Arrange
	const model = { provider, api };

	// Act
	const supported = ResponsesPayload.supports(model);

	// Assert
	expect(supported).toBe(expected);
});

test("does not support a missing model", () => {
	expect.hasAssertions();
	// Arrange
	const model = undefined;

	// Act
	const supported = ResponsesPayload.supports(model);

	// Assert
	// eslint-disable-next-line vitest/prefer-to-be-falsy
	expect(supported).toBe(false);
});

test.each([undefined, null, [], "payload", true])("ignores non-object payload %j", (payload) => {
	expect.hasAssertions();
	// Arrange
	const config = Fixtures.config({ PI_OPENAI_VERBOSITY: "high" });

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toBe(payload);
});

test("null settings leave all payload fields unchanged", () => {
	expect.hasAssertions();
	// Arrange
	const config = Fixtures.config();
	const payload = {
		text: { verbosity: "medium", format: { type: jsonObjectFormat } },
		reasoning: { summary: "auto", effort: "high" },
		tools: [{ type: webSearchPreview }],
		service_tier: "flex",
		input: [],
	};

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toStrictEqual(payload);
	expect(ResponsesPayload.apply({}, config)).toStrictEqual({});
});

test("sets all four fields without losing siblings or mutating the original payload", () => {
	expect.hasAssertions();
	// Arrange
	const config = Fixtures.config({
		PI_OPENAI_VERBOSITY: "low",
		PI_OPENAI_REASONING_SUMMARY: "concise",
		PI_OPENAI_WEB_SEARCH: "true",
		PI_OPENAI_SERVICE_TIER: "priority",
	});
	const payload = Object.freeze({
		text: Object.freeze({ format: { type: jsonObjectFormat }, verbosity: "high" }),
		reasoning: Object.freeze({ effort: "medium", summary: "auto" }),
		tools: Object.freeze([{ type: "function", name: "read" }]),
		service_tier: "default",
		input: [],
	});

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toStrictEqual({
		text: { format: { type: jsonObjectFormat }, verbosity: "low" },
		reasoning: { effort: "medium", summary: "concise" },
		tools: [{ type: "function", name: "read" }, { type: webSearch }],
		service_tier: "priority",
		input: [],
	});
	expect(payload.reasoning.summary).toBe("auto");
});

test.each([{}, { text: null, reasoning: [] }])("creates missing nested objects for %j", (payload) => {
	expect.hasAssertions();
	// Arrange
	const config = Fixtures.config({
		PI_OPENAI_VERBOSITY: "medium",
		PI_OPENAI_REASONING_SUMMARY: "detailed",
		PI_OPENAI_SERVICE_TIER: "ultrafast",
	});

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toStrictEqual({
		text: { verbosity: "medium" },
		reasoning: { summary: "detailed" },
		service_tier: "ultrafast",
	});
});

test.each([
	[{}, {}],
	[{ reasoning: null }, { reasoning: null }],
	[{ reasoning: { effort: "high", summary: "auto", other: true } }, { reasoning: { effort: "high", other: true } }],
])("none removes only reasoning.summary in %j", (payload, expected) => {
	expect.hasAssertions();
	// Arrange
	const config = Fixtures.config({ PI_OPENAI_REASONING_SUMMARY: "none" });
	const original = structuredClone(payload);

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toStrictEqual(expected);
	expect(payload).toStrictEqual(original);
});

test.each(webSearchTypes)(
	"preserves existing %s tools and their options when enabled",
	(type) => {
		expect.hasAssertions();
		// Arrange
		const config = Fixtures.config({ PI_OPENAI_WEB_SEARCH: "true" });
		const payload = { tools: [{ type, search_context_size: "low" }] };

		// Act
		const result = ResponsesPayload.apply(payload, config);

		// Assert
		expect(result).toStrictEqual(payload);
	},
);

test("adds web search only once when tools are absent", () => {
	expect.hasAssertions();
	// Arrange
	const config = Fixtures.config({ PI_OPENAI_WEB_SEARCH: "true" });

	// Act
	const result = ResponsesPayload.apply({}, config);
	const repeated = ResponsesPayload.apply(result, config);

	// Assert
	expect(result).toStrictEqual({ tools: [{ type: webSearch }] });
	expect(repeated).toStrictEqual(result);
});

test("false removes hosted web-search variants but preserves functions and other tools", () => {
	expect.hasAssertions();
	// Arrange
	const config = Fixtures.config({ PI_OPENAI_WEB_SEARCH: "false" });
	const keep = [{ type: "function", name: webSearch }, { type: "file_search" }, { type: 1 }, null];
	const payload = {
		tools: [
			...keep,
			...webSearchTypes.map((type) => ({
				type,
			})),
		],
	};
	const original = structuredClone(payload);

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toStrictEqual({ tools: keep });
	expect(payload).toStrictEqual(original);
});

test.each([{}, { tools: null }, { tools: [] }])("false does not invent tools for %j", (payload) => {
	expect.hasAssertions();
	// Arrange
	const config = Fixtures.config({ PI_OPENAI_WEB_SEARCH: "false" });

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toStrictEqual(payload);
});
