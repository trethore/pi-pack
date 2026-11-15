import { RunMetricsConfig } from "#src/config";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("@earendil-works/pi-coding-agent"), () => ({ getAgentDir: vi.fn<typeof getAgentDir>() }));

const fixture = { directory: "", path: "" };
const defaultFormat = "<timetaken> | <tokps> | ↑ <input_tokens> ↓ <output_tokens> | <cost>";

beforeEach(() => {
	fixture.directory = mkdtempSync(join(tmpdir(), "pi-run-metrics-config-"));
	fixture.path = join(fixture.directory, "pi-run-metrics.jsonc");
	vi.mocked(getAgentDir).mockReturnValue(fixture.directory);
});

afterEach(() => {
	rmSync(fixture.directory, { recursive: true, force: true });
	vi.resetAllMocks();
});

test("uses defaults without a config file", () => {
	expect.hasAssertions();
	// Arrange: the agent directory is empty.

	// Act
	const config = RunMetricsConfig.read();

	// Assert
	expect(config).toStrictEqual({ enabled: true, format: defaultFormat });
});

test("reads custom formatting and enabled setting from JSONC", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(fixture.path, '{ /* config */ "enabled": false, "format": "Cost <cost>", }');

	// Act
	const config = RunMetricsConfig.read();

	// Assert
	expect(config).toStrictEqual({ enabled: false, format: "Cost <cost>" });
});

test.each(['{"enabled": "true"}', '{"format": 42}', "null", '{"enabled":'])(
	"rejects invalid config %s",
	(source) => {
		expect.hasAssertions();
		// Arrange
		writeFileSync(fixture.path, source);

		// Act
		const { read } = RunMetricsConfig;

		// Assert
		expect(read).toThrow(/Invalid (?:config|JSONC)/u);
	},
);

test.each(["{}", readFileSync(new URL("../pi-run-metrics.example.jsonc", import.meta.url), "utf8")])(
	"accepts empty config and the shipped example: %s",
	(source) => {
		expect.hasAssertions();
		// Arrange
		writeFileSync(fixture.path, source);

		// Act
		const config = RunMetricsConfig.read();

		// Assert
		expect(config).toStrictEqual({ enabled: true, format: defaultFormat });
	},
);
