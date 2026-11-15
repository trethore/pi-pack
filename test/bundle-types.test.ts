import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const fixture = { directory: "" };
const script = fileURLToPath(new URL("../scripts/bundle-types.ts", import.meta.url));
const files = {
	"package.json": JSON.stringify({ type: "module", imports: { "#src/*": "./src/*.ts" } }),
	"tsconfig.build.json": JSON.stringify({ compilerOptions: { module: "NodeNext", target: "ES2024" } }),
	"dist/types/index.d.ts": 'export type { Options } from "#src/options";',
	"dist/types/options.d.ts": 'import type { Stats } from "node:fs"; export interface Options { stats: Stats; }',
};

beforeEach(() => {
	fixture.directory = mkdtempSync(join(tmpdir(), "pi-pack-dts-test-"));
	mkdirSync(join(fixture.directory, "dist/types"), { recursive: true });
	for (const [path, source] of Object.entries(files)) {
		writeFileSync(join(fixture.directory, path), source);
	}
});

afterEach(() => {
	rmSync(fixture.directory, { recursive: true, force: true });
});

test("bundles emitted declarations without source files and preserves external imports", () => {
	expect.hasAssertions();
	// Arrange
	const output = join(fixture.directory, "dist/index.d.ts");

	// Act
	execFileSync(process.execPath, [script], { cwd: fixture.directory, stdio: "pipe" });
	const declaration = readFileSync(output, "utf8");

	// Assert
	expect(declaration).toContain("interface Options");
	expect(declaration).toContain('from "node:fs"');
	expect(declaration).not.toContain("#src/");
});
