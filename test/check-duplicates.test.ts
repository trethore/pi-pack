import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dedent } from "@pi-pack/shared/dedent";

const originalWrapper = fileURLToPath(new URL("../scripts/check-duplicates.mjs", import.meta.url));
let fixtureDirectory: string;

function mockLauncher(source: string): string {
  return dedent(`
    console.log(JSON.stringify({ source: ${JSON.stringify(source)}, args: process.argv.slice(2), cwd: process.cwd() }));
    process.exit(Number(process.env.JSCPD_TEST_EXIT_CODE ?? "0"));
  `);
}

beforeEach(() => {
  fixtureDirectory = mkdtempSync(path.join(tmpdir(), "pi-pack-jscpd-wrapper-"));
  const scriptsDirectory = path.join(fixtureDirectory, "scripts");
  const npmPackageDirectory = path.join(fixtureDirectory, "node_modules", "jscpd");
  mkdirSync(scriptsDirectory, { recursive: true });
  mkdirSync(npmPackageDirectory, { recursive: true });
  copyFileSync(originalWrapper, path.join(scriptsDirectory, "check-duplicates.mjs"));
  writeFileSync(path.join(npmPackageDirectory, "run-jscpd.js"), mockLauncher("npm"));
  writeFileSync(path.join(fixtureDirectory, ".jscpd.json"), "{}\n");
  writeFileSync(path.join(fixtureDirectory, "nix jscpd"), `#!${process.execPath}\n${mockLauncher("nix")}`, {
    mode: 0o755,
  });
});

afterEach(() => {
  rmSync(fixtureDirectory, { recursive: true, force: true });
});

describe("duplication check wrapper", () => {
  it.each([
    { source: "npm", exitCode: 0 },
    { source: "npm", exitCode: 3 },
    { source: "nix", exitCode: 0 },
    { source: "nix", exitCode: 3 },
  ])("uses the $source launcher and preserves exit code $exitCode", ({ source, exitCode }) => {
    // Arrange
    const wrapper = path.join(fixtureDirectory, "scripts", "check-duplicates.mjs");
    const configFile = path.join(fixtureDirectory, ".jscpd.json");
    const environment = {
      ...process.env,
      JSCPD_BIN: source === "nix" ? path.join(fixtureDirectory, "nix jscpd") : "",
      JSCPD_TEST_EXIT_CODE: String(exitCode),
    };

    // Act
    const result = spawnSync(process.execPath, [wrapper, "--threshold", "1"], {
      cwd: tmpdir(),
      env: environment,
      encoding: "utf8",
    });

    // Assert
    expect(result.status).toBe(exitCode);
    expect(JSON.parse(result.stdout)).toEqual({
      source,
      args: ["--config", configFile, "--no-tips", "--fail-on-empty", "--threshold", "1"],
      cwd: fixtureDirectory,
    });
  });

  it.each([
    { source: "npm", expectedError: "Could not locate npm jscpd" },
    { source: "nix", expectedError: "Could not run jscpd" },
  ])("reports a missing $source executable", ({ source, expectedError }) => {
    // Arrange
    const wrapper = path.join(fixtureDirectory, "scripts", "check-duplicates.mjs");
    const environment = {
      ...process.env,
      JSCPD_BIN: source === "nix" ? path.join(fixtureDirectory, "missing-jscpd") : "",
    };
    if (source === "npm") {
      rmSync(path.join(fixtureDirectory, "node_modules", "jscpd"), { recursive: true, force: true });
    }

    // Act
    const result = spawnSync(process.execPath, [wrapper], {
      env: environment,
      encoding: "utf8",
    });

    // Assert
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedError);
  });
});
