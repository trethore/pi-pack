import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Scope } from "#src/constants";
import { countingScript, useWorkspace } from "#test/workspace";

const files = useWorkspace();

it("prefers project scripts across extensions and warns without absolute paths", async () => {
  // Arrange
  await files.script("platform", countingScript("global"), Scope.GLOBAL, "js");
  await files.script("platform", countingScript("project"));
  const workspace = await files.load();

  // Act
  const output = await workspace.placeholders?.expand("{{platform}} {{platform}}");

  // Assert
  expect(output).toBe("project project");
  expect(workspace.warnings).toEqual([
    'pi-script-placeholders: "platform" exists globally and in the project; using the project script.',
  ]);
  expect(await files.runs()).toBe("x");
});

it("rejects ambiguous scripts in the winning scope without global fallback", async () => {
  // Arrange
  await files.script("platform", countingScript("global"), Scope.GLOBAL);
  await files.script("platform", countingScript("project"));
  await files.script("platform", countingScript("ambiguous"), Scope.PROJECT, "js");
  const workspace = await files.load();

  // Act
  const output = await workspace.placeholders?.expand("{{platform}} {{platform}}");

  // Assert
  expect(output).toBe("{{platform}} {{platform}}");
  expect(await files.runs()).toBe("");
  expect(workspace.warnings).toHaveLength(2);
  expect(workspace.warnings[1]).toContain("both .js and .mjs scripts in project scope");
});

it("does not let ambiguity in the overridden global scope block a project script", async () => {
  // Arrange
  await files.script("platform", "", Scope.GLOBAL);
  await files.script("platform", "", Scope.GLOBAL, "js");
  await files.script("platform", countingScript("project"));
  const workspace = await files.load();

  // Act / Assert
  expect(await workspace.placeholders?.expand("{{platform}}")).toBe("project");
  expect(workspace.warnings).toHaveLength(1);
});

it("uses global scripts in untrusted projects without probing project scripts", async () => {
  // Arrange
  await files.script("platform", countingScript("global"), Scope.GLOBAL);
  await files.script("platform", countingScript("project"));
  const workspace = await files.load(false);

  // Act / Assert
  expect(await workspace.placeholders?.expand("{{platform}}")).toBe("global");
  expect(workspace.warnings).toEqual([]);
});

it("supports script symlinks and ignores directories with script-like names", async () => {
  // Arrange
  const target = join(files.root, "target.mjs");
  await writeFile(target, countingScript("linked"));
  await symlink(target, join(files.directory(Scope.GLOBAL), "script-placeholders", "linked.mjs"));
  await mkdir(join(files.directory(Scope.PROJECT), "script-placeholders", "linked.js"));
  const workspace = await files.load();

  // Act / Assert
  expect(await workspace.placeholders?.expand("{{linked}}")).toBe("linked");
  expect(workspace.warnings).toEqual([]);
});

it("treats absent script directories as empty and warns on unreadable ones", async () => {
  // Arrange
  await rm(join(files.directory(Scope.PROJECT), "script-placeholders"), { recursive: true });
  const globalDirectory = join(files.agentDir, "script-placeholders");
  await rm(globalDirectory, { recursive: true });
  await writeFile(globalDirectory, "not a directory");

  // Act
  const workspace = await files.load();

  // Assert
  expect(workspace.warnings).toEqual(["pi-script-placeholders: Could not read global script-placeholders directory."]);
});
