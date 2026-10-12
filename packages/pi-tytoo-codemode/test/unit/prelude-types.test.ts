import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const prelude = join(root, "src/sandbox/prelude");
const config = join(prelude, "tsconfig.json");
const compiler = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin/tsc");

it("typechecks the prelude with only ECMAScript libraries and approved sandbox dependencies", () => {
  // Arrange
  const sharedFiles = new Set([
    "src/declarations/identifier.ts",
    "src/prompts/generated.ts",
    "src/sandbox/bootstrap.ts",
    "src/sandbox/bridge-protocol.ts",
    "src/sandbox/constants.ts",
    "src/sandbox/limits.ts",
    "src/sandbox/values.ts",
  ]);

  // Act
  const result = spawnSync(process.execPath, [compiler, "-p", config, "--listFiles", "--pretty", "false"], {
    encoding: "utf8",
  });
  const files = result.stdout.trim().split(/\r?\n/);

  // Assert
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(files).toContain(join(prelude, "index.ts"));
  for (const file of files) {
    const path = relative(root, file).replaceAll("\\", "/");
    const standardLibrary =
      /\/node_modules\/(?:typescript|@typescript\/typescript-[^/]+)\/lib\/lib\.(?:es[\w.]*|decorators(?:\.legacy)?)\.d\.ts$/.test(
        file.replaceAll("\\", "/"),
      );
    const allowed = path.startsWith("src/sandbox/prelude/") || sharedFiles.has(path) || standardLibrary;
    expect(allowed, `Unexpected prelude dependency: ${file}`).toBe(true);
  }
});

it("rejects Node and DOM globals in the actual prelude typechecking context", async () => {
  // Arrange
  const directory = await mkdtemp(join(tmpdir(), "tytoo-prelude-types-"));
  const globals = ["process", "Buffer", "document", "window", "fetch", "setTimeout", "require"];
  try {
    await writeFile(join(directory, "globals.ts"), globals.map((name) => `void ${name};`).join("\n"));
    await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ extends: config, files: ["globals.ts"] }));

    // Act
    const result = spawnSync(process.execPath, [compiler, "-p", directory, "--pretty", "false"], { encoding: "utf8" });

    // Assert
    expect(result.status, result.stdout + result.stderr).toBeGreaterThan(0);
    for (const name of globals) {
      expect(result.stdout).toContain(`Cannot find name '${name}'`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
