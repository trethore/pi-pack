import { readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { parse } from "jsonc-parser";
import { afterEach, expect, test, vi } from "vitest";
import { model, setup } from "#openai-settings-test/fixtures.ts";

afterEach(() => vi.unstubAllEnvs());

test("defaults expose only the master-switch command and leave requests untouched", async () => {
	// Arrange
	const { commands, emit } = setup();
	const payload = { text: { verbosity: "high" } };
	// Act
	await emit({ type: Events.BeforeProviderRequest, payload });
	// Assert
	expect(commands.size).toBe(1);
	expect(await commands.get("openai-settings")?.getArgumentCompletions?.("")).toEqual([
		{ value: "enabled", label: "enabled" },
	]);
	expect(payload).toEqual({ text: { verbosity: "high" } });
});

test("skipping config applies only explicit environment settings and exposes only the master switch", async () => {
	// Arrange
	vi.stubEnv("PI_OPENAI_CONFIG", "false");
	vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
	const { commands, emit } = setup('{"enabled":false,"webSearch":{"value":true,"command":true}}');
	const payload = {};
	// Act
	await emit({ type: Events.BeforeProviderRequest, payload });
	// Assert
	expect(commands.size).toBe(1);
	expect(await commands.get("openai-settings")?.getArgumentCompletions?.("")).toEqual([
		{ value: "enabled", label: "enabled" },
	]);
	expect(payload).toEqual({ text: { verbosity: "low" } });
});

test.each([
	["openai", "openai-responses"],
	["azure", "azure-openai-responses"],
	["github-copilot", "openai-responses"],
])("edits requests for %s/%s", async (provider, api) => {
	// Arrange
	const { emit } = setup('{"verbosity":{"value":"medium"}}', model(provider, api));
	const payload = {};
	// Act
	await emit({ type: Events.BeforeProviderRequest, payload });
	// Assert
	expect(payload).toEqual({ text: { verbosity: "medium" } });
});

test("checks the current model on every request", async () => {
	// Arrange
	const selected = model();
	const { emit } = setup('{"verbosity":{"value":"high"}}', selected);
	const first = {};
	const second = {};
	const third = {};
	// Act
	await emit({ type: Events.BeforeProviderRequest, payload: first });
	selected.api = "openai-completions";
	await emit({ type: Events.BeforeProviderRequest, payload: second });
	selected.api = "openai-responses";
	selected.provider = "openrouter";
	await emit({ type: Events.BeforeProviderRequest, payload: third });
	// Assert
	expect(first).toEqual({ text: { verbosity: "high" } });
	expect(second).toEqual({});
	expect(third).toEqual({});
});

test("commands override environment immediately and preserve comments and unrelated saved values", async () => {
	// Arrange
	vi.stubEnv("PI_OPENAI_VERBOSITY", "high");
	vi.stubEnv("PI_OPENAI_SERVICE_TIER", "ultrafast");
	const { emit, runCommand, notify } = setup(`{
		// Keep this comment.
		"verbosity": { "value": "medium", "command": true },
		"serviceTier": { "value": "default" },
	}`);
	const before = {};
	const after = {};
	const next = {};
	// Act
	await emit({ type: Events.BeforeProviderRequest, payload: before });
	await runCommand("openai-settings", "verbosity low");
	await emit({ type: Events.BeforeProviderRequest, payload: after });
	await emit({ type: Events.BeforeProviderRequest, payload: next });
	const saved = readFileSync(join(getAgentDir(), "pi-openai-settings.jsonc"), "utf8");
	// Assert
	expect(before).toEqual({ text: { verbosity: "high" }, service_tier: "ultrafast" });
	expect(after).toEqual({ text: { verbosity: "low" }, service_tier: "ultrafast" });
	expect(next).toEqual(after);
	expect(saved).toContain("// Keep this comment.");
	expect(parse(saved)).toEqual({
		verbosity: { value: "low", command: true },
		serviceTier: { value: "default" },
	});
	expect(notify).toHaveBeenCalledWith("OpenAI verbosity = low. Saved globally.", "info");
});

test.each(["true", "false"])(
	"master commands override environment values with no feature commands (PI_OPENAI_CONFIG=%s)",
	async (configFlag) => {
		// Arrange
		vi.stubEnv("PI_OPENAI_CONFIG", configFlag);
		vi.stubEnv("PI_OPENAI_ENABLED", "false");
		vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
		const { commands, runCommand, emit } = setup('{"verbosity":{"command":false}}');
		const disabled = {};
		const enabled = {};
		const disabledAgain = {};
		// Act
		await emit({ type: Events.BeforeProviderRequest, payload: disabled });
		await runCommand("openai-settings", "enabled true");
		await emit({ type: Events.BeforeProviderRequest, payload: enabled });
		await runCommand("openai-settings", "enabled false");
		await emit({ type: Events.BeforeProviderRequest, payload: disabledAgain });
		// Assert
		expect(commands.has("openai-settings")).toBe(true);
		expect(disabled).toEqual({});
		expect(enabled).toEqual({ text: { verbosity: "low" } });
		expect(disabledAgain).toEqual({});
		expect(JSON.parse(readFileSync(join(getAgentDir(), "pi-openai-settings.jsonc"), "utf8"))).toEqual({
			enabled: false,
			verbosity: { command: false },
		});
	},
);

test("a feature command does not implicitly enable the master switch", async () => {
	// Arrange
	const { runCommand, emit, notify } = setup('{"enabled":false,"verbosity":{"command":true}}');
	const payload = {};
	// Act
	await runCommand("openai-settings", "verbosity low");
	await emit({ type: Events.BeforeProviderRequest, payload });
	// Assert
	expect(payload).toEqual({});
	expect(notify).toHaveBeenCalledWith(expect.stringContaining("Master switch is off"), "info");
});

test.each([
	["verbosity", "low"],
	["verbosity", "medium"],
	["verbosity", "high"],
	["verbosity", "null"],
	["reasoningSummary", "concise"],
	["reasoningSummary", "auto"],
	["reasoningSummary", "detailed"],
	["reasoningSummary", "none"],
	["reasoningSummary", "null"],
	["webSearch", "true"],
	["webSearch", "false"],
	["webSearch", "null"],
	["serviceTier", "default"],
	["serviceTier", "priority"],
	["serviceTier", "ultrafast"],
	["serviceTier", "null"],
])("accepts and saves %s %s", async (setting, input) => {
	// Arrange
	const { runCommand, notify } = setup(JSON.stringify({ [setting]: { command: true } }));
	const value: unknown = ["true", "false", "null"].includes(input) ? JSON.parse(input) : input;
	// Act
	await runCommand("openai-settings", `${setting} ${input}`);
	// Assert
	expect(JSON.parse(readFileSync(join(getAgentDir(), "pi-openai-settings.jsonc"), "utf8"))).toEqual({
		[setting]: { command: true, value },
	});
	expect(notify).toHaveBeenCalledWith(expect.stringContaining("Saved globally"), "info");
});

test("null command overrides environment while leaving provider fields untouched", async () => {
	// Arrange
	vi.stubEnv("PI_OPENAI_REASONING_SUMMARY", "none");
	const { runCommand, emit } = setup('{"reasoningSummary":{"value":"detailed","command":true}}');
	const payload = { reasoning: { summary: "auto" } };
	// Act
	await runCommand("openai-settings", "reasoningSummary null");
	await emit({ type: Events.BeforeProviderRequest, payload });
	// Assert
	expect(payload).toEqual({ reasoning: { summary: "auto" } });
});

test.each([
	"",
	"verbosity",
	"verbosity low extra",
	"unknown true",
	"webSearch true",
	"__proto__ true",
	"verbosity none",
	"enabled null",
])("rejects unavailable or invalid commands without saving: %s", async (args) => {
	// Arrange
	const source = '{"verbosity":{"value":"medium","command":true}}';
	const { runCommand, emit, notify } = setup(source);
	const payload = {};
	// Act
	await runCommand("openai-settings", args);
	await emit({ type: Events.BeforeProviderRequest, payload });
	// Assert
	expect(payload).toEqual({ text: { verbosity: "medium" } });
	expect(readFileSync(join(getAgentDir(), "pi-openai-settings.jsonc"), "utf8")).toBe(source);
	expect(notify).toHaveBeenCalledOnce();
	expect(notify.mock.calls[0]?.[0]).not.toContain("Saved globally");
});

test("completions expose only available settings and valid values", async () => {
	// Arrange
	const { commands } = setup('{"verbosity":{"command":true},"reasoningSummary":{"command":true}}');
	const complete = commands.get("openai-settings")?.getArgumentCompletions;
	// Act / Assert
	expect(await complete?.("")).toEqual([
		{ value: "enabled", label: "enabled" },
		{ value: "verbosity", label: "verbosity" },
		{ value: "reasoningSummary", label: "reasoningSummary" },
	]);
	expect(await complete?.("verb")).toEqual([{ value: "verbosity", label: "verbosity" }]);
	expect(await complete?.("reasoningSummary n")).toEqual([
		{ value: "reasoningSummary none", label: "none" },
		{ value: "reasoningSummary null", label: "null" },
	]);
	expect(await complete?.("enabled ")).toEqual([
		{ value: "enabled true", label: "true" },
		{ value: "enabled false", label: "false" },
	]);
	expect(await complete?.("webSearch ")).toBeNull();
	expect(await complete?.("verbosity low extra")).toBeNull();
});

test("failed saves report an error and leave the current session setting unchanged", async () => {
	// Arrange
	const { runCommand, emit, notify } = setup('{"verbosity":{"value":"medium","command":true}}');
	const path = join(getAgentDir(), "pi-openai-settings.jsonc");
	rmSync(path);
	mkdirSync(path);
	const payload = {};
	// Act
	await runCommand("openai-settings", "verbosity low");
	await emit({ type: Events.BeforeProviderRequest, payload });
	// Assert
	expect(notify).toHaveBeenCalledWith(expect.stringContaining("Could not read config"), "error");
	expect(payload).toEqual({ text: { verbosity: "medium" } });
});

test("invalid config reports an error and registers neither payload edits nor commands", async () => {
	// Arrange
	const { emit, commands, notify } = setup('{"verbosity":{"value":"none"}}');
	// Act
	await emit(Events.SessionStart);
	// Assert
	expect(commands.size).toBe(0);
	expect(notify).toHaveBeenCalledWith(expect.stringContaining("Extension inactive until a successful reload"), "error");
	await expect(emit({ type: Events.BeforeProviderRequest, payload: {} })).rejects.toThrow("Missing handler");
});

test("the master command enables a config-disabled extension with every feature command disabled", async () => {
	// Arrange
	const { commands, runCommand, emit } = setup(
		JSON.stringify({
			enabled: false,
			verbosity: { value: "low", command: false },
			reasoningSummary: { command: false },
			webSearch: { command: false },
			serviceTier: { command: false },
		}),
	);
	const before = {};
	const after = {};

	// Act
	await emit({ type: Events.BeforeProviderRequest, payload: before });
	await runCommand("openai-settings", "enabled true");
	await emit({ type: Events.BeforeProviderRequest, payload: after });

	// Assert
	expect(before).toEqual({});
	expect(after).toEqual({ text: { verbosity: "low" } });
	expect(await commands.get("openai-settings")?.getArgumentCompletions?.("")).toEqual([
		{ value: "enabled", label: "enabled" },
	]);
	expect(JSON.parse(readFileSync(join(getAgentDir(), "pi-openai-settings.jsonc"), "utf8"))).toEqual({
		enabled: true,
		verbosity: { value: "low", command: false },
		reasoningSummary: { command: false },
		webSearch: { command: false },
		serviceTier: { command: false },
	});
});

test.each(["verbosity low", "reasoningSummary none", "webSearch true", "serviceTier priority"])(
	"disabled feature commands remain unavailable while the master command exists: %s",
	async (args) => {
		// Arrange
		const { commands, runCommand, notify } = setup("{}");

		// Act
		await runCommand("openai-settings", args);

		// Assert
		expect(commands.has("openai-settings")).toBe(true);
		expect(notify).toHaveBeenCalledExactlyOnceWith(
			"Usage: /openai-settings <setting> <value>\nenabled <true|false>",
			"info",
		);
		expect(readFileSync(join(getAgentDir(), "pi-openai-settings.jsonc"), "utf8")).toBe("{}");
	},
);
