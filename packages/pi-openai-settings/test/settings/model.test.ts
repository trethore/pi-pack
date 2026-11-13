import { expect, test } from "vitest";
import {
	configSchema,
	isSetting,
	parseSetting,
	settingDefinitions,
	settingNames,
	updateSetting,
} from "#openai-settings/settings/model";

test.each(settingNames)("every advertised %s value is accepted by the config schema", (setting) => {
	// Arrange
	const config = configSchema.parse({});
	const values = settingDefinitions[setting].values.map((input) => parseSetting(setting, input));

	// Act
	const updated = values.map((value) => updateSetting(config, setting, value));

	// Assert
	expect(updated.map((next) => (setting === "enabled" ? next.enabled : next[setting].value))).toEqual(values);
});

test.each([
	["enabled", "false", false],
	["webSearch", "true", true],
	["webSearch", "null", null],
	["reasoningSummary", "none", "none"],
	["verbosity", "low", "low"],
] as const)("parses %s %s without changing sentinel meanings", (setting, input, expected) => {
	// Arrange / Act
	const value = parseSetting(setting, input);

	// Assert
	expect(value).toBe(expected);
});

test.each(["toString", "__proto__", "unknown"])("rejects unknown or inherited setting names: %s", (name) => {
	// Arrange / Act
	const valid = isSetting(name);

	// Assert
	expect(valid).toBe(false);
});

test.each(settingNames)("rejects invalid %s input before updating configuration", (setting) => {
	// Arrange
	const input = "invalid";

	// Act / Assert
	expect(() => parseSetting(setting, input)).toThrow(`${setting} must be one of:`);
});

test("updates a value without mutating the original config or losing feature options", () => {
	// Arrange
	const config = configSchema.parse({ enabled: false, webSearch: { command: true, captureResponses: false } });
	const original = structuredClone(config);

	// Act
	const next = updateSetting(config, "webSearch", true);

	// Assert
	expect(config).toEqual(original);
	expect(next).toEqual({ ...original, webSearch: { value: true, command: true, captureResponses: false } });
});
