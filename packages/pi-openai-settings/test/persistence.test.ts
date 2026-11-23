/* eslint-disable unicorn/no-null -- Null is a supported setting value. */
import { OpenAISettingsConfig } from "#src/config";
import { configFilename } from "#src/constants";
import { OpenAISettingsController } from "#src/controller";
import { Fixtures, TestCommand } from "#test/fixtures";
import { Harness } from "#test/harness";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("@earendil-works/pi-coding-agent"), () => ({ getAgentDir: vi.fn<typeof getAgentDir>() }));
vi.mock(import("node:fs/promises"), async (importOriginal) => {
	const original = await importOriginal();
	return { ...original, rename: vi.fn<typeof rename>(original.rename) };
});

const fixture = {
	root: "",
	directory: "",
	path: "",
	async write(source: string): Promise<void> {
		await mkdir(fixture.directory, { recursive: true });
		await writeFile(fixture.path, source);
	},
};

beforeEach(async () => {
	fixture.root = await mkdtemp(join(tmpdir(), "pi-openai-persistence-"));
	fixture.directory = join(fixture.root, "agent");
	fixture.path = join(fixture.directory, configFilename);
	vi.mocked(getAgentDir).mockReturnValue(fixture.directory);
	for (const name of ["CONFIG", "ENABLED", "VERBOSITY", "REASONING_SUMMARY", "WEB_SEARCH", "SERVICE_TIER"]) {
		vi.stubEnv(`PI_OPENAI_${name}`, undefined);
	}
});

afterEach(async () => {
	await rm(fixture.root, { recursive: true, force: true });
	vi.resetAllMocks();
	vi.unstubAllEnvs();
});

test.each([
	["verbosity low", "verbosity", { value: "low" }],
	["reasoningSummary none", "reasoningSummary", { value: "none" }],
	[TestCommand.EnableWebSearch, "webSearch", { value: true }],
	["serviceTier priority", "serviceTier", { value: "priority" }],
	[TestCommand.Disable, "enabled", false],
])("persists %s while creating a missing global directory and config", async (command, name, expected) => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(await Fixtures.config());

	// Act
	const message = await controller.command(command);
	const saved: unknown = JSON.parse(await readFile(fixture.path, "utf8"));

	// Assert
	expect(saved).toStrictEqual({ [name]: expected });
	expect(message).toContain("saved to global config");
	await expect(readdir(fixture.directory)).resolves.toStrictEqual([configFilename]);
});

test("preserves comments, permissions, unknown fields, and unrelated file values", async () => {
	expect.hasAssertions();
	// Arrange
	const original =
		'{\n\t// keep this comment\n\t"verbosity": { "value": "low", "command": true },\n\t"serviceTier": { "value": "default" },\n\t"custom": { "keep": true },\n}\n';
	await fixture.write(original);
	const controller = new OpenAISettingsController(
		await OpenAISettingsConfig.read({ PI_OPENAI_SERVICE_TIER: "priority" }),
	);

	// Act
	await controller.command(TestCommand.HighVerbosity);

	// Assert
	await expect(readFile(fixture.path, "utf8")).resolves.toBe(original.replace('"low"', '"high"'));
	expect(controller.apply({}, Fixtures.model)).toStrictEqual({ text: { verbosity: "high" }, service_tier: "priority" });
});

test.each(["verbosity", "reasoningSummary", "webSearch", "serviceTier"])(
	"persists explicit null for %s",
	async (name) => {
		expect.hasAssertions();
		// Arrange
		await fixture.write(await readFile(new URL("../pi-openai-settings.example.jsonc", import.meta.url), "utf8"));
		const controller = new OpenAISettingsController(await OpenAISettingsConfig.read({}));

		// Act
		await controller.command(`${name} null`);

		// Assert
		await expect(OpenAISettingsConfig.read({})).resolves.toMatchObject({ [name]: { value: null, command: true } });
	},
);

test("commands update requests immediately and survive extension reload", async () => {
	expect.hasAssertions();
	// Arrange
	await fixture.write('{"verbosity": {"command": true}}');
	const harness = await Harness.create();

	// Act
	await harness.command(TestCommand.HighVerbosity);
	const reloaded = await Harness.create();

	// Assert
	await expect(harness.request({})).resolves.toStrictEqual({ text: { verbosity: "high" } });
	await expect(reloaded.request({})).resolves.toStrictEqual({ text: { verbosity: "high" } });
	expect(harness.notify).toHaveBeenCalledWith("verbosity = high (saved to global config)", "info");
});

test("persists commands even when global config reading is disabled", async () => {
	expect.hasAssertions();
	// Arrange
	await fixture.write('{"verbosity": {"value": "low", "command": true}}');
	const controller = new OpenAISettingsController(await OpenAISettingsConfig.read({ PI_OPENAI_CONFIG: "false" }));

	// Act
	await controller.command(TestCommand.Disable);

	// Assert
	expect(controller.apply({}, Fixtures.model)).toBeUndefined();
	await expect(OpenAISettingsConfig.read({})).resolves.toMatchObject({
		enabled: false,
		verbosity: { value: "low", command: true },
	});
});

test("environment overrides persisted values only on reload", async () => {
	expect.hasAssertions();
	// Arrange
	const env = { PI_OPENAI_ENABLED: "false" };
	const controller = new OpenAISettingsController(await OpenAISettingsConfig.read(env));

	// Act
	await controller.command(TestCommand.Enable);
	const reloaded = new OpenAISettingsController(await OpenAISettingsConfig.read(env));

	// Assert
	expect(controller.apply({}, Fixtures.model)).toStrictEqual({});
	await expect(OpenAISettingsConfig.read({})).resolves.toMatchObject({ enabled: true });
	expect(reloaded.apply({}, Fixtures.model)).toBeUndefined();
});

test("edits the latest file without overwriting unrelated external changes", async () => {
	expect.hasAssertions();
	// Arrange
	await fixture.write('{"verbosity": {"command": true}}');
	const controller = new OpenAISettingsController(await OpenAISettingsConfig.read({}));
	await fixture.write('{"verbosity": {"command": true}, "custom": 42}');

	// Act
	await controller.command("verbosity low");

	// Assert
	await expect(readFile(fixture.path, "utf8")).resolves.toContain('"custom": 42');
});

test.each(['{"enabled":', "null", "[]", '"text"', "// empty"])(
	"refuses to overwrite invalid config %s",
	async (source) => {
		expect.hasAssertions();
		// Arrange
		await fixture.write(source);
		const controller = new OpenAISettingsController(await Fixtures.config());

		// Act
		function command(): Promise<string> {
			return controller.command(TestCommand.Disable);
		}

		// Assert
		await expect(command()).rejects.toThrow("valid JSONC object");
		await expect(readFile(fixture.path, "utf8")).resolves.toBe(source);
		expect(controller.apply({}, Fixtures.model)).toStrictEqual({});
	},
);

test("reports read failures without changing runtime settings", async () => {
	expect.hasAssertions();
	// Arrange
	await mkdir(fixture.path, { recursive: true });
	const controller = new OpenAISettingsController(await Fixtures.config());

	// Act
	function command(): Promise<string> {
		return controller.command(TestCommand.Disable);
	}

	// Assert
	await expect(command()).rejects.toThrow(/EISDIR/u);
	expect(controller.apply({}, Fixtures.model)).toStrictEqual({});
});

test.each([TestCommand.HighVerbosity, TestCommand.Disable])(
	"failed save of %s leaves disk and runtime unchanged and removes the temporary file",
	async (command) => {
		expect.hasAssertions();
		// Arrange
		const source = '{"verbosity": {"value": "low", "command": true}}';
		await fixture.write(source);
		const harness = await Harness.create();
		vi.mocked(rename).mockImplementationOnce(() => {
			throw new Error("write denied");
		});

		// Act
		await harness.command(command);

		// Assert
		expect(harness.notify).toHaveBeenCalledWith("Error: write denied", "error");
		await expect(readFile(fixture.path, "utf8")).resolves.toBe(source);
		await expect(readdir(fixture.directory)).resolves.toStrictEqual([configFilename]);
		await expect(harness.request({})).resolves.toStrictEqual({ text: { verbosity: "low" } });
	},
);

test("overlapping commands preserve both disk and runtime updates", async () => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(await Fixtures.config());

	// Act
	await Promise.all([
		controller.command(TestCommand.HighVerbosity),
		controller.command(TestCommand.EnableWebSearch),
	]);

	// Assert
	await expect(OpenAISettingsConfig.read({})).resolves.toMatchObject({
		verbosity: { value: "high" },
		webSearch: { value: true },
	});
	expect(controller.apply({}, Fixtures.model)).toStrictEqual({
		text: { verbosity: "high" },
		tools: [{ type: "web_search" }],
	});
});
