import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dedent } from "@pi-pack/shared/dedent";

const originalScript = fileURLToPath(new URL("../scripts/import-pi.sh", import.meta.url));
let fixtureDirectory: string;
let script: string;

beforeEach(() => {
  fixtureDirectory = mkdtempSync(path.join(tmpdir(), "pi-pack-import-"));
  const scriptsDirectory = path.join(fixtureDirectory, "scripts");
  const binDirectory = path.join(fixtureDirectory, "bin");
  mkdirSync(scriptsDirectory);
  mkdirSync(binDirectory);
  mkdirSync(path.join(fixtureDirectory, "pi"));
  writeFileSync(path.join(fixtureDirectory, "pi", "existing-file"), "existing source");
  script = path.join(scriptsDirectory, "import-pi.sh");
  copyFileSync(originalScript, script);
  writeFileSync(
    path.join(binDirectory, "git"),
    dedent(`
      #!${process.execPath}
      console.log(JSON.stringify(process.argv.slice(2)));
      process.exit(Number(process.env.GIT_TEST_EXIT_CODE ?? "0"));
    `),
    { mode: 0o755 },
  );
});

afterEach(() => {
  rmSync(fixtureDirectory, { recursive: true, force: true });
});

function runImport(args: string[], exitCode = 0) {
  return spawnSync("bash", [script, ...args], {
    cwd: tmpdir(),
    env: {
      ...process.env,
      PATH: `${path.join(fixtureDirectory, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
      GIT_TEST_EXIT_CODE: String(exitCode),
    },
    encoding: "utf8",
  });
}

describe("Pi source import", () => {
  it.each([{ args: [] }, { args: [""] }, { args: ["v1.0.0", "v2.0.0"] }])(
    "rejects invalid arguments $args without deleting existing source",
    ({ args }) => {
      // Arrange
      const existingFile = path.join(fixtureDirectory, "pi", "existing-file");

      // Act
      const result = runImport(args);

      // Assert
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage: npm run import:pi -- <tag>");
      expect(result.stdout).toBe("");
      expect(readFileSync(existingFile, "utf8")).toBe("existing source");
    },
  );

  it.each([0, 3])("clones the requested tag and preserves git exit code %i", (exitCode) => {
    // Arrange
    const tag = "v1.0.0";

    // Act
    const result = runImport([tag], exitCode);

    // Assert
    expect(result.status).toBe(exitCode);
    expect(JSON.parse(result.stdout)).toEqual([
      "clone",
      "--depth",
      "1",
      "--branch",
      tag,
      "https://github.com/earendil-works/pi.git",
      path.join(fixtureDirectory, "pi"),
    ]);
  });
});
