import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { type ConfigLocation, ConfigScope, readConfig } from "@pi-pack/config";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, expectTypeOf, test, vi } from "vitest";
import { z } from "zod";

vi.mock(import("@earendil-works/pi-coding-agent"), () => ({ getAgentDir: vi.fn<typeof getAgentDir>() }));
vi.mock(import("node:fs/promises"), { spy: true });

const FILENAME = "settings.jsonc";
const schema = z.object({ enabled: z.boolean() });
const globalLocation: ConfigLocation = { scope: ConfigScope.Global };
const fixture: { root: string; globalDirectory: string; projectDirectory: string; projectLocation: ConfigLocation } = {
	root: "",
	globalDirectory: "",
	projectDirectory: "",
	projectLocation: globalLocation,
};

beforeEach(async () => {
	fixture.root = await mkdtemp(join(tmpdir(), "pi-pack-config-"));
	fixture.globalDirectory = join(fixture.root, "agent");
	fixture.projectDirectory = join(fixture.root, "project", ".pi");
	await mkdir(fixture.globalDirectory, { recursive: true });
	await mkdir(fixture.projectDirectory, { recursive: true });
	fixture.projectLocation = { scope: ConfigScope.Project, projectDir: join(fixture.root, "project"), trusted: true };
	vi.mocked(getAgentDir).mockReturnValue(fixture.globalDirectory);
});

afterEach(async () => {
	vi.resetAllMocks();
	await rm(fixture.root, { recursive: true, force: true });
});

test("reads JSONC with comments and trailing commas from the global agent directory", async () => {
	expect.hasAssertions();
	// Arrange
	await writeFile(join(fixture.globalDirectory, FILENAME), '{ /* comment */ "enabled": true, // comment\n }');

	// Act
	const config = await readConfig(FILENAME, globalLocation, schema);

	// Assert
	expect(config).toStrictEqual({ enabled: true });
	expect(getAgentDir).toHaveBeenCalledExactlyOnceWith();
});

test("reads only the trusted project's .pi directory without merging global settings", async () => {
	expect.hasAssertions();
	// Arrange
	await writeFile(join(fixture.globalDirectory, FILENAME), '{"enabled": false, "globalOnly": true}');
	await writeFile(join(fixture.projectDirectory, FILENAME), '{"enabled": true}');
	const mergeSchema = schema.extend({ globalOnly: z.boolean().optional() });

	// Act
	const config = await readConfig(FILENAME, fixture.projectLocation, mergeSchema);

	// Assert
	expect(config).toStrictEqual({ enabled: true });
	expect(getAgentDir).not.toHaveBeenCalled();
});

test("does not fall back to global config when the project config is missing", async () => {
	expect.hasAssertions();
	// Arrange
	await writeFile(join(fixture.globalDirectory, FILENAME), '{"enabled": true}');

	// Act
	const config = await readConfig(FILENAME, fixture.projectLocation, schema);

	// Assert
	expect(config).toBeUndefined();
	expect(getAgentDir).not.toHaveBeenCalled();
});

test("does not access files or validate schemas for untrusted projects", async () => {
	expect.hasAssertions();
	// Arrange
	const location = { scope: ConfigScope.Project, projectDir: fixture.root, trusted: false };
	const validate = vi.fn<() => undefined>();
	const untrustedSchema = z.unknown().transform(validate);

	// Act
	const config = await readConfig(FILENAME, location, untrustedSchema);

	// Assert
	expect(config).toBeUndefined();
	expect(readFile).not.toHaveBeenCalled();
	expect(getAgentDir).not.toHaveBeenCalled();
	expect(validate).not.toHaveBeenCalled();
});

test.each([ConfigScope.Global, ConfigScope.Project])("returns undefined for a missing %s file", async (scope) => {
	expect.hasAssertions();
	// Arrange
	let location: ConfigLocation = globalLocation;
	if (scope === ConfigScope.Project) {
		location = fixture.projectLocation;
	}
	const defaultSchema = z.unknown().default({ enabled: true });

	// Act
	const config = await readConfig(FILENAME, location, defaultSchema);

	// Assert
	expect(config).toBeUndefined();
});

test("returns undefined when the project's .pi directory is missing", async () => {
	expect.hasAssertions();
	// Arrange
	await rm(fixture.projectDirectory, { recursive: true });

	// Act
	const config = await readConfig(FILENAME, fixture.projectLocation, schema);

	// Assert
	expect(config).toBeUndefined();
});

test.each([
	"",
	".",
	"..",
	"../config.json",
	"nested/config.json",
	String.raw`nested\config.json`,
	"/config.json",
	"a\0b",
])(
	"rejects invalid filename %j before accessing files, even for untrusted projects",
	async (invalidFilename) => {
		expect.hasAssertions();
		// Arrange
		const location = { scope: ConfigScope.Project, projectDir: fixture.root, trusted: false };

		// Act
		function read() {
			return readConfig(invalidFilename, location, schema);
		}

		// Assert
		await expect(read()).rejects.toThrow("Config filename must be a filename, not a path.");
		expect(readFile).not.toHaveBeenCalled();
		expect(getAgentDir).not.toHaveBeenCalled();
	},
);

test.each(["", "// comment only", '{"enabled":}', '{"enabled": true} garbage', '{"enabled": true} {}'])(
	"rejects malformed JSONC %j with its path and parse error offset",
	async (source) => {
		expect.hasAssertions();
		// Arrange
		const path = join(fixture.globalDirectory, FILENAME);
		await writeFile(path, source);

		// Act
		function read() {
			return readConfig(FILENAME, globalLocation, z.unknown());
		}

		// Assert
		await expect(read()).rejects.toThrow(`Invalid JSONC in ${path}:`);
		await expect(read()).rejects.toThrow(/at offset \d+\./u);
	},
);

test("includes the file path, field details, and original Zod error on validation failure", async () => {
	expect.hasAssertions();
	// Arrange
	const path = join(fixture.globalDirectory, FILENAME);
	await writeFile(path, '{"enabled": "yes"}');

	// Act
	function read() {
		return readConfig(FILENAME, globalLocation, schema);
	}

	// Assert
	await expect(read()).rejects.toThrow(`Invalid config ${path}:`);
	await expect(read()).rejects.toThrow("enabled");
	await expect(read()).rejects.toThrow(expect.objectContaining({ cause: expect.any(z.ZodError) as unknown }));
});

test("returns schema output including defaults and transforms with the inferred output type", async () => {
	expect.hasAssertions();
	// Arrange
	await writeFile(join(fixture.globalDirectory, FILENAME), '{"name": "  example  "}');
	const outputSchema = z.object({
		name: z.string().transform((name) => name.trim()),
		enabled: z.boolean().default(true),
	});

	// Act
	const config = await readConfig(FILENAME, globalLocation, outputSchema);

	// Assert
	expect(config).toStrictEqual({ name: "example", enabled: true });
	expectTypeOf(config).toEqualTypeOf<{ name: string; enabled: boolean } | undefined>();
});

test.each(["null", "false", "0", '""', "[]"])("lets the caller's schema accept JSON value %s", async (source) => {
	expect.hasAssertions();
	// Arrange
	await writeFile(join(fixture.globalDirectory, FILENAME), source);

	// Act
	const config = await readConfig(FILENAME, globalLocation, z.unknown());

	// Assert
	expect(config).toStrictEqual(JSON.parse(source));
});

test.each([Object.assign(new Error("Permission denied"), { code: "EACCES" }), new Error("Read failed"), "failure"])(
	"wraps non-ENOENT read failures with the path and original cause: %j",
	async (cause) => {
		expect.hasAssertions();
		// Arrange
		vi.mocked(readFile).mockImplementationOnce(() => {
			throw cause;
		});

		// Act
		function read() {
			return readConfig(FILENAME, globalLocation, schema);
		}

		// Assert
		await expect(read()).rejects.toThrow(expect.objectContaining({
			message: `Could not read config ${join(fixture.globalDirectory, FILENAME)}.`,
			cause,
		}));
	},
);
