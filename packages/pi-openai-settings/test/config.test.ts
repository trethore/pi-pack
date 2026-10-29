import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { loadConfig, saveSetting } from "#openai-settings/config.ts";
import { setup } from "#openai-settings-test/fixtures.ts";

afterEach(() => vi.unstubAllEnvs());

test("defaults to an enabled master switch with inert features and no commands", () => {
	// Arrange
	setup();
	// Act
	const config = loadConfig();
	// Assert
	expect(config).toEqual({
		enabled: true,
		verbosity: { value: null, command: false },
		reasoningSummary: { value: null, command: false },
		webSearch: { value: null, command: false },
		serviceTier: { value: null, command: false },
	});
});

test("reads global JSONC with comments, trailing commas, and partial feature entries", () => {
	// Arrange
	setup('{ // Settings\n "verbosity": {"value": "high",}, "webSearch": {"command": true}, }');
	// Act
	const config = loadConfig();
	// Assert
	expect(config.verbosity).toEqual({ value: "high", command: false });
	expect(config.webSearch).toEqual({ value: null, command: true });
});

test("ignores project config", () => {
	// Arrange
	setup();
	const project = join(getAgentDir(), "project");
	mkdirSync(join(project, ".pi"), { recursive: true });
	writeFileSync(join(project, ".pi", "pi-openai-settings.jsonc"), '{"enabled":false}');
	const original = process.cwd();
	// Act
	let enabled: boolean;
	try {
		process.chdir(project);
		enabled = loadConfig().enabled;
	} finally {
		process.chdir(original);
	}
	// Assert
	expect(enabled).toBe(true);
});

test("environment overrides values without changing command flags", () => {
	// Arrange
	setup('{"enabled":false,"verbosity":{"value":"high","command":true}}');
	vi.stubEnv("PI_OPENAI_ENABLED", "true");
	vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
	vi.stubEnv("PI_OPENAI_REASONING_SUMMARY", "none");
	vi.stubEnv("PI_OPENAI_WEB_SEARCH", "false");
	vi.stubEnv("PI_OPENAI_SERVICE_TIER", "ultrafast");
	// Act
	const config = loadConfig();
	// Assert
	expect(config).toEqual({
		enabled: true,
		verbosity: { value: "low", command: true },
		reasoningSummary: { value: "none", command: false },
		webSearch: { value: false, command: false },
		serviceTier: { value: "ultrafast", command: false },
	});
});

test.each([undefined, "false"])("feature overrides do not enable a disabled master switch (%s)", (override) => {
	// Arrange
	setup('{"enabled":false}');
	vi.stubEnv("PI_OPENAI_ENABLED", override);
	vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
	// Act
	const config = loadConfig();
	// Assert
	expect(config.enabled).toBe(false);
	expect(config.verbosity.value).toBe("low");
});

test.each(['{"enabled":false,"webSearch":{"value":true,"command":true}}', "{broken"])(
	"PI_OPENAI_CONFIG=false skips the entire file: %s",
	(source) => {
		// Arrange
		setup(source);
		vi.stubEnv("PI_OPENAI_CONFIG", "false");
		vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
		// Act
		const config = loadConfig();
		// Assert
		expect(config.enabled).toBe(true);
		expect(config.verbosity).toEqual({ value: "low", command: false });
		expect(config.webSearch).toEqual({ value: null, command: false });
	},
);

test("explicit config loading and master enable inherit remaining saved values", () => {
	// Arrange
	setup('{"enabled":false,"verbosity":{"value":"high"},"webSearch":{"value":true}}');
	vi.stubEnv("PI_OPENAI_CONFIG", "true");
	vi.stubEnv("PI_OPENAI_ENABLED", "true");
	// Act
	const config = loadConfig();
	// Assert
	expect(config.enabled).toBe(true);
	expect(config.verbosity.value).toBe("high");
	expect(config.webSearch.value).toBe(true);
});

test("null environment values suppress config overrides without requesting removal", () => {
	// Arrange
	setup(
		'{"verbosity":{"value":"high"},"reasoningSummary":{"value":"none"},"webSearch":{"value":false},"serviceTier":{"value":"priority"}}',
	);
	for (const name of ["VERBOSITY", "REASONING_SUMMARY", "WEB_SEARCH", "SERVICE_TIER"]) {
		vi.stubEnv(`PI_OPENAI_${name}`, "null");
	}
	// Act
	const config = loadConfig();
	// Assert
	for (const feature of [config.verbosity, config.reasoningSummary, config.webSearch, config.serviceTier]) {
		expect(feature.value).toBeNull();
	}
});

test.each([
	"{",
	"null",
	"[]",
	'{"enabled":null}',
	'{"verbosity":null}',
	'{"verbosity":{"enabled":true}}',
	'{"verbosity":{"value":"none"}}',
	'{"serviceTier":{"value":"none"}}',
	'{"webSearch":{"value":"true"}}',
	'{"reasoningSummary":{"value":false}}',
	'{"verbosity":{"command":"true"}}',
	'{"unknown":true}',
])("rejects invalid config: %s", (source) => {
	// Arrange
	setup(source);
	// Act / Assert
	expect(() => loadConfig()).toThrow(/Invalid (JSONC|config)/u);
});

test.each([
	["PI_OPENAI_CONFIG", "yes"],
	["PI_OPENAI_ENABLED", "null"],
	["PI_OPENAI_VERBOSITY", "none"],
	["PI_OPENAI_REASONING_SUMMARY", "false"],
	["PI_OPENAI_WEB_SEARCH", "1"],
	["PI_OPENAI_SERVICE_TIER", ""],
])("reports invalid %s", (name, value) => {
	// Arrange
	setup();
	vi.stubEnv(name, value);
	// Act / Assert
	expect(() => loadConfig()).toThrow(name);
});

test("saving creates a missing agent directory and only the requested field", () => {
	// Arrange
	setup();
	const directory = getAgentDir();
	rmSync(directory, { recursive: true });
	// Act
	saveSetting("reasoningSummary", "none");
	// Assert
	expect(JSON.parse(readFileSync(join(directory, "pi-openai-settings.jsonc"), "utf8"))).toEqual({
		reasoningSummary: { value: "none" },
	});
});

test("invalid existing config is never overwritten by a save", () => {
	// Arrange
	setup("{broken");
	// Act / Assert
	expect(() => saveSetting("verbosity", "low")).toThrow("Invalid JSONC");
	expect(readFileSync(join(getAgentDir(), "pi-openai-settings.jsonc"), "utf8")).toBe("{broken");
});
