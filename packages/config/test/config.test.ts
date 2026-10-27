import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "@pi-pack/config";
import { z } from "zod";
import { afterEach, expect, expectTypeOf, test, vi } from "vitest";

function directory(): string {
	return mkdtempSync(join(process.env.HOME ?? "", "config-"));
}

afterEach(() => vi.unstubAllEnvs());

test("reads global JSONC from PI_CODING_AGENT_DIR", () => {
	// Arrange
	const globalDir = directory();
	vi.stubEnv("PI_CODING_AGENT_DIR", globalDir);
	writeFileSync(join(globalDir, "example.jsonc"), '{ // comment\n "enabled": true, }');

	// Act
	const value = readConfig("example.jsonc", { scope: "global" }, z.unknown());

	// Assert
	expect(value).toEqual({ enabled: true });
});

test("uses the default Pi agent directory without an override", () => {
	// Arrange
	vi.stubEnv("PI_CODING_AGENT_DIR", undefined);
	const globalDir = join(process.env.HOME ?? "", ".pi", "agent");
	mkdirSync(globalDir, { recursive: true });
	writeFileSync(join(globalDir, "example.jsonc"), '{"defaultPath": true}');

	// Act
	const value = readConfig("example.jsonc", { scope: "global" }, z.unknown());

	// Assert
	expect(value).toEqual({ defaultPath: true });
});

test.each([true, false])("only reads project config with explicit trust: %s", (trusted) => {
	// Arrange
	const projectDir = directory();
	mkdirSync(join(projectDir, ".pi"));
	writeFileSync(join(projectDir, ".pi", "example.jsonc"), '{"project": true}');

	// Act
	const value = readConfig("example.jsonc", { scope: "project", projectDir, trusted }, z.unknown());

	// Assert
	expect(value).toEqual(trusted ? { project: true } : undefined);
});

test("does not parse untrusted project config", () => {
	// Arrange
	const projectDir = directory();
	mkdirSync(join(projectDir, ".pi"));
	writeFileSync(join(projectDir, ".pi", "example.jsonc"), "invalid");

	// Act
	const value = readConfig("example.jsonc", { scope: "project", projectDir, trusted: false }, z.unknown());

	// Assert
	expect(value).toBeUndefined();
});

test("returns undefined for a missing file", () => {
	// Arrange
	vi.stubEnv("PI_CODING_AGENT_DIR", directory());

	// Act
	const value = readConfig("missing.jsonc", { scope: "global" }, z.unknown());

	// Assert
	expect(value).toBeUndefined();
});

test.each(["", "{", '{"x": nope}', "{} {}"])("reports malformed JSONC with its path: %j", (source) => {
	// Arrange
	const globalDir = directory();
	vi.stubEnv("PI_CODING_AGENT_DIR", globalDir);
	const filename = "invalid.jsonc";
	const path = join(globalDir, filename);
	writeFileSync(path, source);

	// Act
	const read = () => readConfig(filename, { scope: "global" }, z.unknown());

	// Assert
	expect(read).toThrow(`Invalid JSONC in ${path}`);
});

test("reports read failures with the path", () => {
	// Arrange
	const globalDir = directory();
	vi.stubEnv("PI_CODING_AGENT_DIR", globalDir);
	const filename = "directory.jsonc";
	const path = join(globalDir, filename);
	mkdirSync(path);

	// Act
	const read = () => readConfig(filename, { scope: "global" }, z.unknown());

	// Assert
	expect(read).toThrow(`Could not read config ${path}.`);
});

test.each(["null", "[1, 2]", "false", "42", '"text"'])(
	"accepts arbitrary values when the schema allows them: %s",
	(source) => {
		// Arrange
		const globalDir = directory();
		vi.stubEnv("PI_CODING_AGENT_DIR", globalDir);
		writeFileSync(join(globalDir, "example.jsonc"), source);

		// Act
		const value = readConfig("example.jsonc", { scope: "global" }, z.unknown());

		// Assert
		expect(value).toEqual(JSON.parse(source));
	},
);

test.each(["", ".", "..", "../outside.jsonc", "/tmp/example.jsonc", "nested/example.jsonc", "nested\\example.jsonc"])(
	"rejects config paths: %j",
	(filename) => {
		// Arrange
		vi.stubEnv("PI_CODING_AGENT_DIR", directory());

		// Act
		const read = () => readConfig(filename, { scope: "global" }, z.unknown());

		// Assert
		expect(read).toThrow("Config filename must be a filename, not a path.");
	},
);

test("applies schema defaults and infers the output type", () => {
	// Arrange
	const globalDir = directory();
	vi.stubEnv("PI_CODING_AGENT_DIR", globalDir);
	writeFileSync(join(globalDir, "example.jsonc"), "{}");
	const schema = z.strictObject({ enabled: z.boolean().default(true) });

	// Act
	const value = readConfig("example.jsonc", { scope: "global" }, schema);

	// Assert
	expect(value).toEqual({ enabled: true });
	expectTypeOf(value).toEqualTypeOf<{ enabled: boolean } | undefined>();
});

test.each([
	{ source: '{"enable": false}', detail: "enable" },
	{ source: '{"enabled": "yes"}', detail: "enabled" },
	{ source: '{"messages": [42]}', detail: "messages[0]" },
])("reports schema errors with the path and field: $source", ({ source, detail }) => {
	// Arrange
	const globalDir = directory();
	vi.stubEnv("PI_CODING_AGENT_DIR", globalDir);
	const path = join(globalDir, "example.jsonc");
	writeFileSync(path, source);
	const schema = z.strictObject({ enabled: z.boolean().optional(), messages: z.array(z.string()).optional() });

	// Act
	const read = () => readConfig("example.jsonc", { scope: "global" }, schema);

	// Assert
	expect(read).toThrow(`Invalid config ${path}`);
	expect(read).toThrow(detail);
});

test("does not apply schema defaults when the file is missing", () => {
	// Arrange
	vi.stubEnv("PI_CODING_AGENT_DIR", directory());
	const schema = z.strictObject({ enabled: z.boolean().default(true) });

	// Act
	const value = readConfig("missing.jsonc", { scope: "global" }, schema);

	// Assert
	expect(value).toBeUndefined();
});
