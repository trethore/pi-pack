/* eslint-disable unicorn/no-null -- Null is a supported setting value. */
import { OpenAISettingsConfig } from "#src/config";
import { OpenAISettingsController } from "#src/controller";
import { Fixtures } from "#test/fixtures";
import { Harness } from "#test/harness";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("@earendil-works/pi-coding-agent"), () => ({ getAgentDir: vi.fn<typeof getAgentDir>() }));
vi.mock(import("node:fs"), async (importOriginal) => {
	const original = await importOriginal();
	return { ...original, renameSync: vi.fn<typeof renameSync>(original.renameSync) };
});

const fixture = {
	root: "",
	directory: "",
	path: "",
	write(source: string): void {
		mkdirSync(fixture.directory, { recursive: true });
		writeFileSync(fixture.path, source);
	},
};

beforeEach(() => {
	fixture.root = mkdtempSync(join(tmpdir(), "pi-openai-persistence-"));
	fixture.directory = join(fixture.root, "agent");
	fixture.path = join(fixture.directory, "pi-openai-settings.jsonc");
	vi.mocked(getAgentDir).mockReturnValue(fixture.directory);
	for (const name of ["CONFIG", "ENABLED", "VERBOSITY", "REASONING_SUMMARY", "WEB_SEARCH", "SERVICE_TIER"]) {
		vi.stubEnv(`PI_OPENAI_${name}`, undefined);
	}
});

afterEach(() => {
	rmSync(fixture.root, { recursive: true, force: true });
	vi.resetAllMocks();
	vi.unstubAllEnvs();
});

test.each([
	["verbosity low", "verbosity", { value: "low" }],
	["reasoningSummary none", "reasoningSummary", { value: "none" }],
	["webSearch true", "webSearch", { value: true }],
	["serviceTier priority", "serviceTier", { value: "priority" }],
	["enabled false", "enabled", false],
])("persists %s while creating a missing global directory and config", (command, name, expected) => {
	expect.hasAssertions();
	// Arrange
	const controller = new OpenAISettingsController(Fixtures.config());

	// Act
	const message = controller.command(command);
	const saved: unknown = JSON.parse(readFileSync(fixture.path, "utf8"));

	// Assert
	expect(saved).toStrictEqual({ [name]: expected });
	expect(message).toContain("saved to global config");
	expect(readdirSync(fixture.directory)).toStrictEqual(["pi-openai-settings.jsonc"]);
});

test("preserves comments, permissions, unknown fields, and unrelated file values", () => {
	expect.hasAssertions();
	// Arrange
	const original =
		'{\n\t// keep this comment\n\t"verbosity": { "value": "low", "command": true },\n\t"serviceTier": { "value": "default" },\n\t"custom": { "keep": true },\n}\n';
	fixture.write(original);
	const controller = new OpenAISettingsController(OpenAISettingsConfig.read({ PI_OPENAI_SERVICE_TIER: "priority" }));

	// Act
	controller.command("verbosity high");

	// Assert
	expect(readFileSync(fixture.path, "utf8")).toBe(original.replace('"low"', '"high"'));
	expect(controller.apply({}, Fixtures.model)).toStrictEqual({ text: { verbosity: "high" }, service_tier: "priority" });
});

test.each(["verbosity", "reasoningSummary", "webSearch", "serviceTier"])("persists explicit null for %s", (name) => {
	expect.hasAssertions();
	// Arrange
	fixture.write(readFileSync(new URL("../pi-openai-settings.example.jsonc", import.meta.url), "utf8"));
	const controller = new OpenAISettingsController(OpenAISettingsConfig.read({}));

	// Act
	controller.command(`${name} null`);

	// Assert
	expect(OpenAISettingsConfig.read({})).toMatchObject({ [name]: { value: null, command: true } });
});

test("commands update requests immediately and survive extension reload", async () => {
	expect.hasAssertions();
	// Arrange
	fixture.write('{"verbosity": {"command": true}}');
	const harness = Harness.create();

	// Act
	await harness.command("verbosity high");
	const reloaded = Harness.create();

	// Assert
	await expect(harness.request({})).resolves.toStrictEqual({ text: { verbosity: "high" } });
	await expect(reloaded.request({})).resolves.toStrictEqual({ text: { verbosity: "high" } });
	expect(harness.notify).toHaveBeenCalledWith("verbosity = high (saved to global config)", "info");
});

test("persists commands even when global config reading is disabled", () => {
	expect.hasAssertions();
	// Arrange
	fixture.write('{"verbosity": {"value": "low", "command": true}}');
	const controller = new OpenAISettingsController(OpenAISettingsConfig.read({ PI_OPENAI_CONFIG: "false" }));

	// Act
	controller.command("enabled false");

	// Assert
	expect(controller.apply({}, Fixtures.model)).toBeUndefined();
	expect(OpenAISettingsConfig.read({})).toMatchObject({ enabled: false, verbosity: { value: "low", command: true } });
});

test("environment overrides persisted values only on reload", () => {
	expect.hasAssertions();
	// Arrange
	const env = { PI_OPENAI_ENABLED: "false" };
	const controller = new OpenAISettingsController(OpenAISettingsConfig.read(env));

	// Act
	controller.command("enabled true");
	const reloaded = new OpenAISettingsController(OpenAISettingsConfig.read(env));

	// Assert
	expect(controller.apply({}, Fixtures.model)).toStrictEqual({});
	expect(OpenAISettingsConfig.read({})).toMatchObject({ enabled: true });
	expect(reloaded.apply({}, Fixtures.model)).toBeUndefined();
});

test("edits the latest file without overwriting unrelated external changes", () => {
	expect.hasAssertions();
	// Arrange
	fixture.write('{"verbosity": {"command": true}}');
	const controller = new OpenAISettingsController(OpenAISettingsConfig.read({}));
	fixture.write('{"verbosity": {"command": true}, "custom": 42}');

	// Act
	controller.command("verbosity low");

	// Assert
	expect(readFileSync(fixture.path, "utf8")).toContain('"custom": 42');
});

test.each(['{"enabled":', "null", "[]", '"text"', "// empty"])("refuses to overwrite invalid config %s", (source) => {
	expect.hasAssertions();
	// Arrange
	fixture.write(source);
	const controller = new OpenAISettingsController(Fixtures.config());

	// Act
	function command(): string {
		return controller.command("enabled false");
	}

	// Assert
	expect(command).toThrow("valid JSONC object");
	expect(readFileSync(fixture.path, "utf8")).toBe(source);
	expect(controller.apply({}, Fixtures.model)).toStrictEqual({});
});

test("reports read failures without changing runtime settings", () => {
	expect.hasAssertions();
	// Arrange
	mkdirSync(fixture.path, { recursive: true });
	const controller = new OpenAISettingsController(Fixtures.config());

	// Act
	function command(): string {
		return controller.command("enabled false");
	}

	// Assert
	expect(command).toThrow(/EISDIR/u);
	expect(controller.apply({}, Fixtures.model)).toStrictEqual({});
});

test.each(["verbosity high", "enabled false"])(
	"failed save of %s leaves disk and runtime unchanged and removes the temporary file",
	async (command) => {
		expect.hasAssertions();
		// Arrange
		const source = '{"verbosity": {"value": "low", "command": true}}';
		fixture.write(source);
		const harness = Harness.create();
		vi.mocked(renameSync).mockImplementationOnce(() => {
			throw new Error("write denied");
		});

		// Act
		await harness.command(command);

		// Assert
		expect(harness.notify).toHaveBeenCalledWith("Error: write denied", "error");
		expect(readFileSync(fixture.path, "utf8")).toBe(source);
		expect(readdirSync(fixture.directory)).toStrictEqual(["pi-openai-settings.jsonc"]);
		await expect(harness.request({})).resolves.toStrictEqual({ text: { verbosity: "low" } });
	},
);
