import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, test } from "vitest";

const execute = promisify(execFile);
const fixture = { directory: "" };
const script = fileURLToPath(new URL("../scripts/bundle-types.ts", import.meta.url));
const files = {
	"package.json": JSON.stringify({ type: "module", imports: { "#src/*": "./src/*.ts" } }),
	"tsconfig.build.json": JSON.stringify({ compilerOptions: { module: "NodeNext", target: "ES2024" } }),
	"dist/types/index.d.ts": 'export type { Options } from "#src/options";',
	"dist/types/options.d.ts": 'import type { Stats } from "node:fs"; export interface Options { stats: Stats; }',
};

beforeEach(async () => {
	fixture.directory = await mkdtemp(join(tmpdir(), "pi-pack-dts-test-"));
	await mkdir(join(fixture.directory, "dist/types"), { recursive: true });
	await Promise.all(Object.entries(files).map(([path, source]) => writeFile(join(fixture.directory, path), source)));
});

afterEach(async () => {
	await rm(fixture.directory, { recursive: true, force: true });
});

test("bundles emitted declarations without source files and preserves external imports", async () => {
	expect.hasAssertions();
	// Arrange
	const output = join(fixture.directory, "dist/index.d.ts");

	// Act
	await execute(process.execPath, [script], { cwd: fixture.directory });
	const declaration = await readFile(output, "utf8");

	// Assert
	expect(declaration).toContain("interface Options");
	expect(declaration).toContain('from "node:fs"');
	expect(declaration).not.toContain("#src/");
});
