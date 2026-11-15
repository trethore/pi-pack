import { WhimsicalConfig } from "#src/config";
import { messages } from "#src/messages";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("@earendil-works/pi-coding-agent"), () => ({ getAgentDir: vi.fn<typeof getAgentDir>() }));

const fixture = { directory: "", path: "" };

beforeEach(() => {
	fixture.directory = mkdtempSync(join(tmpdir(), "pi-whimsical-config-"));
	fixture.path = join(fixture.directory, "pi-whimsical.jsonc");
	vi.mocked(getAgentDir).mockReturnValue(fixture.directory);
});

afterEach(() => {
	rmSync(fixture.directory, { recursive: true, force: true });
	vi.resetAllMocks();
});

test("enables built-in messages when the config file is missing", () => {
	expect.hasAssertions();
	// Arrange: the agent directory has no config file.

	// Act
	const config = WhimsicalConfig.read();

	// Assert
	expect(config).toStrictEqual({ enabled: true, messages });
	expect(getAgentDir).toHaveBeenCalledExactlyOnceWith();
});

test.each([{}, { messages: [] }])("uses built-in messages for config %j", (value) => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, JSON.stringify(value));

	// Act
	const config = WhimsicalConfig.read();

	// Assert
	expect(config).toStrictEqual({ enabled: true, messages });
});

test("preserves an explicit disabled setting", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, '{"enabled": false}');

	// Act
	const config = WhimsicalConfig.read();

	// Assert
	expect(config).toStrictEqual({ enabled: false, messages });
});

test("reads and trims custom messages without appending the built-in list", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, '{ /* custom */ "messages": ["  Brewing...  ", "Pondering...",], }');

	// Act
	const config = WhimsicalConfig.read();

	// Assert
	expect(config).toStrictEqual({ enabled: true, messages: ["Brewing...", "Pondering..."] });
});

test.each([
	'{"enabled": "true"}',
	'{"enabled": null}',
	'{"messages": "Brewing..."}',
	'{"messages": null}',
	'{"messages": [false]}',
	'{"messages": [""]}',
	'{"messages": ["  "]}',
	"null",
	"[]",
])("rejects invalid config %s", (source) => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, source);

	// Act
	const { read } = WhimsicalConfig;

	// Assert
	expect(read).toThrow(`Invalid config ${fixture.path}:`);
});

test("reports malformed JSONC rather than silently using defaults", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, '{"enabled":');

	// Act
	const { read } = WhimsicalConfig;

	// Assert
	expect(read).toThrow(`Invalid JSONC in ${fixture.path}:`);
});

test("loads the shipped example as a valid config", () => {
	expect.hasAssertions();
	// Arrange
	const source = readFileSync(new URL("../pi-whimsical.example.jsonc", import.meta.url), "utf8");
	writeFileSync(fixture.path, source);

	// Act
	const config = WhimsicalConfig.read();

	// Assert
	expect(config).toStrictEqual({
		enabled: true,
		messages: ["Schlepping...", "Combobulating...", "Vibing...", "Brewing...", "Pondering..."],
	});
});
