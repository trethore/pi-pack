import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { type ConfigLocation, ConfigScope, readConfig } from "@pi-pack/config";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, expectTypeOf, test, vi } from "vitest";
import { z } from "zod";

vi.mock(import("@earendil-works/pi-coding-agent"), () => ({ getAgentDir: vi.fn<typeof getAgentDir>() }));
vi.mock(import("node:fs"), { spy: true });

const FILENAME = "settings.jsonc";
const schema = z.object({ enabled: z.boolean() });
const globalLocation: ConfigLocation = { scope: ConfigScope.Global };
const fixture: { root: string; globalDirectory: string; projectDirectory: string; projectLocation: ConfigLocation } = {
	root: "",
	globalDirectory: "",
	projectDirectory: "",
	projectLocation: globalLocation,
};

beforeEach(() => {
	fixture.root = mkdtempSync(join(tmpdir(), "pi-pack-config-"));
	fixture.globalDirectory = join(fixture.root, "agent");
	fixture.projectDirectory = join(fixture.root, "project", ".pi");
	mkdirSync(fixture.globalDirectory, { recursive: true });
	mkdirSync(fixture.projectDirectory, { recursive: true });
	fixture.projectLocation = { scope: ConfigScope.Project, projectDir: join(fixture.root, "project"), trusted: true };
	vi.mocked(getAgentDir).mockReturnValue(fixture.globalDirectory);
});

afterEach(() => {
	vi.resetAllMocks();
	rmSync(fixture.root, { recursive: true, force: true });
});

test("reads JSONC with comments and trailing commas from the global agent directory", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(join(fixture.globalDirectory, FILENAME), '{ /* comment */ "enabled": true, // comment\n }');

	// Act
	const config = readConfig(FILENAME, globalLocation, schema);

	// Assert
	expect(config).toStrictEqual({ enabled: true });
	expect(getAgentDir).toHaveBeenCalledExactlyOnceWith();
});

test("reads only the trusted project's .pi directory without merging global settings", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(join(fixture.globalDirectory, FILENAME), '{"enabled": false, "globalOnly": true}');
	writeFileSync(join(fixture.projectDirectory, FILENAME), '{"enabled": true}');
	const mergeSchema = schema.extend({ globalOnly: z.boolean().optional() });

	// Act
	const config = readConfig(FILENAME, fixture.projectLocation, mergeSchema);

	// Assert
	expect(config).toStrictEqual({ enabled: true });
	expect(getAgentDir).not.toHaveBeenCalled();
});

test("does not fall back to global config when the project config is missing", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(join(fixture.globalDirectory, FILENAME), '{"enabled": true}');

	// Act
	const config = readConfig(FILENAME, fixture.projectLocation, schema);

	// Assert
	expect(config).toBeUndefined();
	expect(getAgentDir).not.toHaveBeenCalled();
});

test("does not access files or validate schemas for untrusted projects", () => {
	expect.hasAssertions();
	// Arrange
	const location = { scope: ConfigScope.Project, projectDir: fixture.root, trusted: false };
	const validate = vi.fn<() => undefined>();
	const untrustedSchema = z.unknown().transform(validate);

	// Act
	const config = readConfig(FILENAME, location, untrustedSchema);

	// Assert
	expect(config).toBeUndefined();
	expect(readFileSync).not.toHaveBeenCalled();
	expect(getAgentDir).not.toHaveBeenCalled();
	expect(validate).not.toHaveBeenCalled();
});

test.each([ConfigScope.Global, ConfigScope.Project])("returns undefined for a missing %s file", (scope) => {
	expect.hasAssertions();
	// Arrange
	let location: ConfigLocation = globalLocation;
	if (scope === ConfigScope.Project) {
		location = fixture.projectLocation;
	}
	const defaultSchema = z.unknown().default({ enabled: true });

	// Act
	const config = readConfig(FILENAME, location, defaultSchema);

	// Assert
	expect(config).toBeUndefined();
});

test("returns undefined when the project's .pi directory is missing", () => {
	expect.hasAssertions();
	// Arrange
	rmSync(fixture.projectDirectory, { recursive: true });

	// Act
	const config = readConfig(FILENAME, fixture.projectLocation, schema);

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
	(invalidFilename) => {
		expect.hasAssertions();
		// Arrange
		const location = { scope: ConfigScope.Project, projectDir: fixture.root, trusted: false };

		// Act
		function read() {
			return readConfig(invalidFilename, location, schema);
		}

		// Assert
		expect(read).toThrow("Config filename must be a filename, not a path.");
		expect(readFileSync).not.toHaveBeenCalled();
		expect(getAgentDir).not.toHaveBeenCalled();
	},
);

test.each(["", "// comment only", '{"enabled":}', '{"enabled": true} garbage', '{"enabled": true} {}'])(
	"rejects malformed JSONC %j with its path and parse error offset",
	(source) => {
		expect.hasAssertions();
		// Arrange
		const path = join(fixture.globalDirectory, FILENAME);
		writeFileSync(path, source);

		// Act
		function read() {
			return readConfig(FILENAME, globalLocation, z.unknown());
		}

		// Assert
		expect(read).toThrow(`Invalid JSONC in ${path}:`);
		expect(read).toThrow(/at offset \d+\./u);
	},
);

test("includes the file path, field details, and original Zod error on validation failure", () => {
	expect.hasAssertions();
	// Arrange
	const path = join(fixture.globalDirectory, FILENAME);
	writeFileSync(path, '{"enabled": "yes"}');

	// Act
	function read() {
		return readConfig(FILENAME, globalLocation, schema);
	}

	// Assert
	expect(read).toThrow(`Invalid config ${path}:`);
	expect(read).toThrow("enabled");
	expect(read).toThrow(expect.objectContaining({ cause: expect.any(z.ZodError) as unknown }));
});

test("returns schema output including defaults and transforms with the inferred output type", () => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(join(fixture.globalDirectory, FILENAME), '{"name": "  example  "}');
	const outputSchema = z.object({
		name: z.string().transform((name) => name.trim()),
		enabled: z.boolean().default(true),
	});

	// Act
	const config = readConfig(FILENAME, globalLocation, outputSchema);

	// Assert
	expect(config).toStrictEqual({ name: "example", enabled: true });
	expectTypeOf(config).toEqualTypeOf<{ name: string; enabled: boolean } | undefined>();
});

test.each(["null", "false", "0", '""', "[]"])("lets the caller's schema accept JSON value %s", (source) => {
	expect.hasAssertions();
	// Arrange
	writeFileSync(join(fixture.globalDirectory, FILENAME), source);

	// Act
	const config = readConfig(FILENAME, globalLocation, z.unknown());

	// Assert
	expect(config).toStrictEqual(JSON.parse(source));
});

test.each([Object.assign(new Error("Permission denied"), { code: "EACCES" }), new Error("Read failed"), "failure"])(
	"wraps non-ENOENT read failures with the path and original cause: %j",
	(cause) => {
		expect.hasAssertions();
		// Arrange
		vi.mocked(readFileSync).mockImplementationOnce(() => {
			throw cause;
		});

		// Act
		function read() {
			return readConfig(FILENAME, globalLocation, schema);
		}

		// Assert
		expect(read).toThrow(expect.objectContaining({
			message: `Could not read config ${join(fixture.globalDirectory, FILENAME)}.`,
			cause,
		}));
	},
);
