import { ConfigFixture } from "#shared-test/config-fixture";
import { RunMetricsConfig } from "#src/config";
import { type getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";

vi.mock(import("@earendil-works/pi-coding-agent"), () => ({ getAgentDir: vi.fn<typeof getAgentDir>() }));

const fixture = ConfigFixture.use("pi-run-metrics.jsonc");
const DEFAULT_FORMAT = "<timetaken> | <tokps> | ↑ <input_tokens> ↓ <output_tokens> | <cost>";

test("uses defaults without a config file", async () => {
	expect.hasAssertions();
	// Arrange: the agent directory is empty.

	// Act
	const config = await RunMetricsConfig.read();

	// Assert
	expect(config).toStrictEqual({ enabled: true, format: DEFAULT_FORMAT });
});

test("reads custom formatting and enabled setting from JSONC", async () => {
	expect.hasAssertions();
	// Arrange
	await writeFile(fixture.path, '{ /* config */ "enabled": false, "format": "Cost <cost>", }');

	// Act
	const config = await RunMetricsConfig.read();

	// Assert
	expect(config).toStrictEqual({ enabled: false, format: "Cost <cost>" });
});

test.each(['{"enabled": "true"}', '{"format": 42}', "null", '{"enabled":'])(
	"rejects invalid config %s",
	async (source) => {
		expect.hasAssertions();
		// Arrange
		await writeFile(fixture.path, source);

		// Act
		const { read } = RunMetricsConfig;

		// Assert
		await expect(read()).rejects.toThrow(/Invalid (?:config|JSONC)/u);
	},
);

test.each(["{}", await readFile(new URL("../pi-run-metrics.example.jsonc", import.meta.url), "utf8")])(
	"accepts empty config and the shipped example: %s",
	async (source) => {
		expect.hasAssertions();
		// Arrange
		await writeFile(fixture.path, source);

		// Act
		const config = await RunMetricsConfig.read();

		// Assert
		expect(config).toStrictEqual({ enabled: true, format: DEFAULT_FORMAT });
	},
);
