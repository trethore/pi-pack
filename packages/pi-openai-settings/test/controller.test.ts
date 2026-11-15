import { OpenAISettingsConfig } from "#src/config";
import { OpenAISettingsController } from "#src/controller";
import { Fixtures } from "#test/fixtures";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

beforeEach(() => {
	vi.spyOn(OpenAISettingsConfig, "save").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

test.each([
	["verbosity", "low", { text: { verbosity: "low" } }],
	["verbosity", "medium", { text: { verbosity: "medium" } }],
	["verbosity", "high", { text: { verbosity: "high" } }],
	["reasoningSummary", "none", {}],
	["reasoningSummary", "auto", { reasoning: { summary: "auto" } }],
	["reasoningSummary", "concise", { reasoning: { summary: "concise" } }],
	["reasoningSummary", "detailed", { reasoning: { summary: "detailed" } }],
	["webSearch", "true", { tools: [{ type: "web_search" }] }],
	["webSearch", "false", {}],
	["serviceTier", "default", { service_tier: "default" }],
	["serviceTier", "priority", { service_tier: "priority" }],
	["serviceTier", "ultrafast", { service_tier: "ultrafast" }],
])("command %s %s overrides startup settings", (name, value, expected) => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(Fixtures.config());

	// Act
	const message = controller.command(`  ${name}\t${value}  `);
	const payload = controller.apply({}, Fixtures.model);

	// Assert
	expect(message).toContain(`${name} = ${value}`);
	expect(payload).toStrictEqual(expected);
});

test.each(["verbosity", "reasoningSummary", "webSearch", "serviceTier"])(
	"null restores pass-through behavior for %s",
	(name) => {
		expect.hasAssertions();
		// Arrange
		const controller = new OpenAISettingsController(
			Fixtures.config({
				PI_OPENAI_VERBOSITY: "low",
				PI_OPENAI_REASONING_SUMMARY: "none",
				PI_OPENAI_WEB_SEARCH: "true",
				PI_OPENAI_SERVICE_TIER: "priority",
			}),
		);

		// Act
		controller.command(`${name} null`);

		// Assert
		expect(controller.command("")).toContain(`${name} = null`);
	},
);

test.each(["verbosity low", "reasoningSummary auto", "webSearch true", "serviceTier priority"])(
	"rejects disabled feature command %s",
	(command) => {
		expect.hasAssertions();
		// Arrange
		const controller = new OpenAISettingsController(OpenAISettingsConfig.defaults());

		// Act
		function execute(): string {
			return controller.command(command);
		}

		// Assert
		expect(execute).toThrow("command is disabled in the global config");
		expect(controller.apply({}, Fixtures.model)).toStrictEqual({});
		expect(OpenAISettingsConfig.save).not.toHaveBeenCalled();
	},
);

test("the master switch remains available and preserves values across disable/enable transitions", () => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(
		Fixtures.config({ PI_OPENAI_ENABLED: "false", PI_OPENAI_VERBOSITY: "low" }),
	);

	// Act
	const disabled = controller.apply({}, Fixtures.model);
	controller.command("verbosity high");
	controller.command("enabled true");
	const enabled = controller.apply({}, Fixtures.model);
	controller.command("enabled false");

	// Assert
	expect(disabled).toBeUndefined();
	expect(enabled).toStrictEqual({ text: { verbosity: "high" } });
	expect(controller.apply({}, Fixtures.model)).toBeUndefined();
});

test("master switch works when every feature command is disabled", () => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(OpenAISettingsConfig.defaults());

	// Act
	controller.command("enabled false");
	controller.command("enabled true");

	// Assert
	expect(controller.command("")).toContain("enabled = true");
	expect(controller.command("")).toContain("verbosity = null (command false)");
});

test.each([
	"unknown true",
	"constructor true",
	"verbosity",
	"verbosity low extra",
	"verbosity false",
	"reasoningSummary off",
	"webSearch 1",
	"serviceTier auto",
	"enabled null",
])("rejects invalid command %s without changing settings", (command) => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(Fixtures.config());
	const before = controller.command("");

	// Act
	function execute(): string {
		return controller.command(command);
	}

	// Assert
	expect(execute).toThrow(/Unknown setting|Usage:|Invalid/u);
	expect(controller.command("")).toBe(before);
	expect(OpenAISettingsConfig.save).not.toHaveBeenCalled();
});

test("ignores unsupported providers even with settings enabled", () => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(Fixtures.config({ PI_OPENAI_VERBOSITY: "low" }));

	// Act
	const result = controller.apply({}, { provider: "custom", api: "openai-responses" });

	// Assert
	expect(result).toBeUndefined();
});
