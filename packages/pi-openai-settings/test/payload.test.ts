/* eslint-disable unicorn/no-null -- Null is part of the payload and setting contracts. */
import { ResponsesPayload } from "#src/payload";
import { Fixtures } from "#test/fixtures";
import { expect, test } from "vitest";

const JSON_OBJECT_FORMAT = "json_object";
const WEB_SEARCH = "web_search";
const WEB_SEARCH_PREVIEW = "web_search_preview";
const webSearchTypes = [WEB_SEARCH, WEB_SEARCH_PREVIEW, "web_search_preview_2025_03_11", "web_search_2025_08_26"];

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

test.each([undefined, null, [], "payload", true])("ignores non-object payload %j", async (payload) => {
	expect.hasAssertions();
	// Arrange
	const config = await Fixtures.config({ PI_OPENAI_VERBOSITY: "high" });

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toBe(payload);
});

test("null settings leave all payload fields unchanged", async () => {
	expect.hasAssertions();
	// Arrange
	const config = await Fixtures.config();
	const payload = {
		text: { verbosity: "medium", format: { type: JSON_OBJECT_FORMAT } },
		reasoning: { summary: "auto", effort: "high" },
		tools: [{ type: WEB_SEARCH_PREVIEW }],
		service_tier: "flex",
		input: [],
	};

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toStrictEqual(payload);
	expect(ResponsesPayload.apply({}, config)).toStrictEqual({});
});

test("sets all four fields without losing siblings or mutating the original payload", async () => {
	expect.hasAssertions();
	// Arrange
	const config = await Fixtures.config({
		PI_OPENAI_VERBOSITY: "low",
		PI_OPENAI_REASONING_SUMMARY: "concise",
		PI_OPENAI_WEB_SEARCH: "true",
		PI_OPENAI_SERVICE_TIER: "priority",
	});
	const payload = Object.freeze({
		text: Object.freeze({ format: { type: JSON_OBJECT_FORMAT }, verbosity: "high" }),
		reasoning: Object.freeze({ effort: "medium", summary: "auto" }),
		tools: Object.freeze([{ type: "function", name: "read" }]),
		service_tier: "default",
		input: [],
	});

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toStrictEqual({
		text: { format: { type: JSON_OBJECT_FORMAT }, verbosity: "low" },
		reasoning: { effort: "medium", summary: "concise" },
		tools: [{ type: "function", name: "read" }, { type: WEB_SEARCH }],
		service_tier: "priority",
		input: [],
	});
	expect(payload.reasoning.summary).toBe("auto");
});

test.each([{}, { text: null, reasoning: [] }])("creates missing nested objects for %j", async (payload) => {
	expect.hasAssertions();
	// Arrange
	const config = await Fixtures.config({
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
])("none removes only reasoning.summary in %j", async (payload, expected) => {
	expect.hasAssertions();
	// Arrange
	const config = await Fixtures.config({ PI_OPENAI_REASONING_SUMMARY: "none" });
	const original = structuredClone(payload);

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toStrictEqual(expected);
	expect(payload).toStrictEqual(original);
});

test.each(webSearchTypes)(
	"preserves existing %s tools and their options when enabled",
	async (type) => {
		expect.hasAssertions();
		// Arrange
		const config = await Fixtures.config({ PI_OPENAI_WEB_SEARCH: "true" });
		const payload = { tools: [{ type, search_context_size: "low" }] };

		// Act
		const result = ResponsesPayload.apply(payload, config);

		// Assert
		expect(result).toStrictEqual(payload);
	},
);

test("adds web search only once when tools are absent", async () => {
	expect.hasAssertions();
	// Arrange
	const config = await Fixtures.config({ PI_OPENAI_WEB_SEARCH: "true" });

	// Act
	const result = ResponsesPayload.apply({}, config);
	const repeated = ResponsesPayload.apply(result, config);

	// Assert
	expect(result).toStrictEqual({ tools: [{ type: WEB_SEARCH }] });
	expect(repeated).toStrictEqual(result);
});

test("false removes hosted web-search variants but preserves functions and other tools", async () => {
	expect.hasAssertions();
	// Arrange
	const config = await Fixtures.config({ PI_OPENAI_WEB_SEARCH: "false" });
	const keep = [{ type: "function", name: WEB_SEARCH }, { type: "file_search" }, { type: 1 }, null];
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

test.each([{}, { tools: null }, { tools: [] }])("false does not invent tools for %j", async (payload) => {
	expect.hasAssertions();
	// Arrange
	const config = await Fixtures.config({ PI_OPENAI_WEB_SEARCH: "false" });

	// Act
	const result = ResponsesPayload.apply(payload, config);

	// Assert
	expect(result).toStrictEqual(payload);
});
