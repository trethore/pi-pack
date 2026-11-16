/* eslint-disable unicorn/no-null -- Null is a supported configuration value. */
import { ConfigFixture } from "#shared-test/config-fixture";
import { OpenAISettingsConfig } from "#src/config";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("@earendil-works/pi-coding-agent"), () => ({ getAgentDir: vi.fn<typeof getAgentDir>() }));

const fixture: ConfigFixture = { directory: "", path: "" };

beforeEach(() => {
	Object.assign(fixture, ConfigFixture.create("pi-openai-settings.jsonc"));
	vi.mocked(getAgentDir).mockReturnValue(fixture.directory);
});

afterEach(() => {
	ConfigFixture.remove(fixture);
	vi.resetAllMocks();
	vi.unstubAllEnvs();
});

test("defaults to enabled with unchanged values and disabled feature commands", () => {
	expect.hasAssertions();
	// Arrange: no global config exists.

	// Act
	const config = OpenAISettingsConfig.read({});

	// Assert
	expect(config).toStrictEqual({
		enabled: true,
		verbosity: { value: null, command: false },
		reasoningSummary: { value: null, command: false },
		webSearch: { value: null, command: false },
		serviceTier: { value: null, command: false },
	});
	expect(getAgentDir).toHaveBeenCalledExactlyOnceWith();
});

test("reads the shipped JSONC example from the global agent directory", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, readFileSync(new URL("../pi-openai-settings.example.jsonc", import.meta.url), "utf8"));

	// Act
	const config = OpenAISettingsConfig.read({});

	// Assert
	expect(config).toStrictEqual({
		enabled: true,
		verbosity: { value: "low", command: true },
		reasoningSummary: { value: "none", command: true },
		webSearch: { value: true, command: true },
		serviceTier: { value: "priority", command: true },
	});
});

test("fills partial features and preserves the disabled master switch", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(
		fixture.path,
		JSON.stringify({ enabled: false, verbosity: { command: true }, webSearch: { value: false } }),
	);

	// Act
	const config = OpenAISettingsConfig.read({});

	// Assert
	expect(config).toMatchObject({ enabled: false });
	expect(config.verbosity).toStrictEqual({ value: null, command: true });
	expect(config.webSearch).toStrictEqual({ value: false, command: false });
});

test("environment overrides file values without changing command permissions", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, JSON.stringify({ enabled: false, verbosity: { value: "high", command: true } }));

	// Act
	const config = OpenAISettingsConfig.read({
		PI_OPENAI_CONFIG: "true",
		PI_OPENAI_ENABLED: "true",
		PI_OPENAI_VERBOSITY: "low",
		PI_OPENAI_REASONING_SUMMARY: "detailed",
		PI_OPENAI_WEB_SEARCH: "false",
		PI_OPENAI_SERVICE_TIER: "ultrafast",
	});

	// Assert
	expect(config).toStrictEqual({
		enabled: true,
		verbosity: { value: "low", command: true },
		reasoningSummary: { value: "detailed", command: false },
		webSearch: { value: false, command: false },
		serviceTier: { value: "ultrafast", command: false },
	});
});

test("explicit null environment values override configured settings", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, readFileSync(new URL("../pi-openai-settings.example.jsonc", import.meta.url), "utf8"));

	// Act
	const config = OpenAISettingsConfig.read({
		PI_OPENAI_VERBOSITY: "null",
		PI_OPENAI_REASONING_SUMMARY: "null",
		PI_OPENAI_WEB_SEARCH: "null",
		PI_OPENAI_SERVICE_TIER: "null",
	});

	// Assert
	for (const feature of [config.verbosity, config.reasoningSummary, config.webSearch, config.serviceTier]) {
		expect(feature).toStrictEqual({ value: null, command: true });
	}
});

test("disabling PI_OPENAI_CONFIG skips even malformed global config while applying environment", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, "invalid json");

	// Act
	const config = OpenAISettingsConfig.read({
		PI_OPENAI_CONFIG: "false",
		PI_OPENAI_ENABLED: "false",
		PI_OPENAI_WEB_SEARCH: "true",
	});

	// Assert
	expect(getAgentDir).not.toHaveBeenCalled();
	expect(config).toMatchObject({ enabled: false });
	expect(config.webSearch).toStrictEqual({ value: true, command: false });
});

test("reads process environment by default", () => {
	expect.hasAssertions();
	// Arrange
	vi.stubEnv("PI_OPENAI_CONFIG", "false");
	vi.stubEnv("PI_OPENAI_ENABLED", "false");

	// Act
	const config = OpenAISettingsConfig.read();

	// Assert
	expect(config).toMatchObject({ enabled: false });
});

test.each([
	["PI_OPENAI_CONFIG", "null"],
	["PI_OPENAI_ENABLED", "1"],
	["PI_OPENAI_VERBOSITY", "verbose"],
	["PI_OPENAI_REASONING_SUMMARY", "false"],
	["PI_OPENAI_WEB_SEARCH", "yes"],
	["PI_OPENAI_SERVICE_TIER", "auto"],
	["PI_OPENAI_VERBOSITY", ""],
])("rejects invalid environment %s=%s", (name, value) => {
	expect.hasAssertions();
	// Arrange
	const env = { [name]: value };

	// Act
	function read(): OpenAISettingsConfig {
		return OpenAISettingsConfig.read(env);
	}

	// Assert
	expect(read).toThrow(`Invalid ${name}:`);
});

test.each([
	{ enabled: null },
	{ verbosity: null },
	{ verbosity: { value: "auto" } },
	{ reasoningSummary: { value: false } },
	{ webSearch: { value: "true" } },
	{ serviceTier: { value: "flex" } },
	{ webSearch: { command: null } },
	[],
	null,
])("rejects invalid config %j", (value) => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, JSON.stringify(value));

	// Act
	const { read } = OpenAISettingsConfig;

	// Assert
	expect(read).toThrow(`Invalid config ${fixture.path}:`);
});

test("reports malformed JSONC", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, '{"enabled":');

	// Act
	const { read } = OpenAISettingsConfig;

	// Assert
	expect(read).toThrow(`Invalid JSONC in ${fixture.path}:`);
});
