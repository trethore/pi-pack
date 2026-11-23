import { OpenAISettingsConfig } from "#src/config";
import { SettingName } from "#src/constants";
import { OpenAISettingsController } from "#src/controller";
import { Fixtures, TestCommand } from "#test/fixtures";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const verbosityPrefix = `${SettingName.Verbosity} `;
const webSearchPrefix = `${SettingName.WebSearch} `;

beforeEach(() => {
	vi.spyOn(OpenAISettingsConfig, "save").mockResolvedValue(undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

test.each([
	[SettingName.Verbosity, "low", { text: { verbosity: "low" } }],
	[SettingName.Verbosity, "medium", { text: { verbosity: "medium" } }],
	[SettingName.Verbosity, "high", { text: { verbosity: "high" } }],
	[SettingName.ReasoningSummary, "none", {}],
	[SettingName.ReasoningSummary, "auto", { reasoning: { summary: "auto" } }],
	[SettingName.ReasoningSummary, "concise", { reasoning: { summary: "concise" } }],
	[SettingName.ReasoningSummary, "detailed", { reasoning: { summary: "detailed" } }],
	[SettingName.WebSearch, "true", { tools: [{ type: "web_search" }] }],
	[SettingName.WebSearch, "false", {}],
	[SettingName.ServiceTier, "default", { service_tier: "default" }],
	[SettingName.ServiceTier, "priority", { service_tier: "priority" }],
	[SettingName.ServiceTier, "ultrafast", { service_tier: "ultrafast" }],
])("command %s %s overrides startup settings", async (name, value, expected) => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(await Fixtures.config());

	// Act
	const message = await controller.command(`  ${name}\t${value}  `);
	const payload = controller.apply({}, Fixtures.model);

	// Assert
	expect(message).toContain(`${name} = ${value}`);
	expect(payload).toStrictEqual(expected);
});

test.each([SettingName.Verbosity, SettingName.ReasoningSummary, SettingName.WebSearch, SettingName.ServiceTier])(
	"null restores pass-through behavior for %s",
	async (name) => {
		expect.hasAssertions();
		// Arrange
		const controller = new OpenAISettingsController(
			await Fixtures.config({
				PI_OPENAI_VERBOSITY: "low",
				PI_OPENAI_REASONING_SUMMARY: "none",
				PI_OPENAI_WEB_SEARCH: "true",
				PI_OPENAI_SERVICE_TIER: "priority",
			}),
		);

		// Act
		await controller.command(`${name} null`);

		// Assert
		await expect(controller.command("")).resolves.toContain(`${name} = null`);
	},
);

test.each(["verbosity low", "reasoningSummary auto", TestCommand.EnableWebSearch, "serviceTier priority"])(
	"rejects disabled feature command %s",
	async (command) => {
		expect.hasAssertions();
		// Arrange
		const controller = new OpenAISettingsController(OpenAISettingsConfig.defaults());

		// Act
		function execute(): Promise<string> {
			return controller.command(command);
		}

		// Assert
		await expect(execute()).rejects.toThrow("command is disabled in the global config");
		expect(controller.apply({}, Fixtures.model)).toStrictEqual({});
		expect(OpenAISettingsConfig.save).not.toHaveBeenCalled();
	},
);

test("the master switch remains available and preserves values across disable/enable transitions", async () => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(
		await Fixtures.config({ PI_OPENAI_ENABLED: "false", PI_OPENAI_VERBOSITY: "low" }),
	);

	// Act
	const disabled = controller.apply({}, Fixtures.model);
	await controller.command(TestCommand.HighVerbosity);
	await controller.command(TestCommand.Enable);
	const enabled = controller.apply({}, Fixtures.model);
	await controller.command(TestCommand.Disable);

	// Assert
	expect(disabled).toBeUndefined();
	expect(enabled).toStrictEqual({ text: { verbosity: "high" } });
	expect(controller.apply({}, Fixtures.model)).toBeUndefined();
});

test("master switch works when every feature command is disabled", async () => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(OpenAISettingsConfig.defaults());

	// Act
	await controller.command(TestCommand.Disable);
	await controller.command(TestCommand.Enable);

	// Assert
	await expect(controller.command("")).resolves.toContain("enabled = true");
	await expect(controller.command("")).resolves.toContain("verbosity = null (command false)");
});

test.each([
	"unknown true",
	"constructor true",
	SettingName.Verbosity,
	"verbosity low extra",
	"verbosity false",
	"reasoningSummary off",
	"webSearch 1",
	"serviceTier auto",
	"enabled null",
])("rejects invalid command %s without changing settings", async (command) => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(await Fixtures.config());
	const before = await controller.command("");

	// Act
	function execute(): Promise<string> {
		return controller.command(command);
	}

	// Assert
	await expect(execute()).rejects.toThrow(/Unknown setting|Usage:|Invalid/u);
	await expect(controller.command("")).resolves.toBe(before);
	expect(OpenAISettingsConfig.save).not.toHaveBeenCalled();
});

test("ignores unsupported providers even with settings enabled", async () => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(await Fixtures.config({ PI_OPENAI_VERBOSITY: "low" }));

	// Act
	const result = controller.apply({}, { provider: "custom", api: "openai-responses" });

	// Assert
	expect(result).toBeUndefined();
});

test.each([
	["", ["enabled ", verbosityPrefix, "reasoningSummary ", webSearchPrefix, "serviceTier "]],
	["  ver", [verbosityPrefix]],
	["enabled ", [TestCommand.Enable, TestCommand.Disable]],
	[verbosityPrefix, ["verbosity low", "verbosity medium", TestCommand.HighVerbosity, "verbosity null"]],
	["reasoningSummary ", [
		"reasoningSummary concise",
		"reasoningSummary auto",
		"reasoningSummary detailed",
		"reasoningSummary none",
		"reasoningSummary null",
	]],
	[webSearchPrefix, [TestCommand.EnableWebSearch, "webSearch false", "webSearch null"]],
	["serviceTier ", ["serviceTier default", "serviceTier priority", "serviceTier ultrafast", "serviceTier null"]],
	["  verbosity\t h", [TestCommand.HighVerbosity]],
	["reasoningSummary n", ["reasoningSummary none", "reasoningSummary null"]],
	[TestCommand.EnableWebSearch, [TestCommand.EnableWebSearch]],
	["unknown ", []],
	["constructor ", []],
	["enabled n", []],
	["verbosity invalid", []],
	["verbosity low extra", []],
	["verbosity low ", []],
])("completes argument prefix %j", async (prefix, expected) => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(await Fixtures.config());
	const before = await controller.command("");

	// Act
	const items = controller.complete(prefix);

	// Assert
	expect(items.map((item) => item.value)).toStrictEqual(expected);
	await expect(controller.command("")).resolves.toBe(before);
	expect(OpenAISettingsConfig.save).not.toHaveBeenCalled();
});

test("completion respects feature permissions but remains available while disabled", () => {
	expect.hasAssertions();
	// Arrange
	const config = OpenAISettingsConfig.defaults();
	config.enabled = false;
	config.webSearch.command = true;
	const controller = new OpenAISettingsController(config);

	// Act
	const completions = ["", verbosityPrefix, "webSearch f", "enabled t"].map((prefix) => controller.complete(prefix));

	// Assert
	expect(completions).toStrictEqual([
		[{ value: "enabled ", label: SettingName.Enabled }, { value: webSearchPrefix, label: SettingName.WebSearch }],
		[],
		[{ value: "webSearch false", label: "false" }],
		[{ value: TestCommand.Enable, label: "true" }],
	]);
});
