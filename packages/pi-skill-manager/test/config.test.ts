import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig } from "@pi-pack/shared/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configPath, loadConfig, saveConfig } from "../src/config.ts";

let root: string;
let cwd: string;
let agentDir: string;
let project: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skill-manager-config-"));
  cwd = join(root, "project");
  agentDir = join(root, "agent");
  project = configPath(cwd, "project", agentDir);
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(agentDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("loading", () => {
  it("allows every skill with no configuration", async () => {
    // Act / Assert
    await expect(loadConfig(cwd, agentDir)).resolves.toEqual({ enabled: true, skills: [] });
  });

  it("reads global JSONC and replaces it completely with a project config", async () => {
    // Arrange
    await writeFile(configPath(cwd, "global", agentDir), '{ // rules\n "skills": [["global", false],], }');
    expect(await loadConfig(cwd, agentDir)).toEqual({ enabled: true, skills: [["global", false]] });
    await writeFile(project, '{"enabled": false}');

    // Act / Assert
    await expect(loadConfig(cwd, agentDir)).resolves.toEqual({ enabled: false, skills: [] });
  });

  it.each([
    ["{", "offset"],
    ["null", "configuration object"],
    ['{"enabled": "yes"}', "enabled must be a boolean"],
    ['{"skills": null}', "skills must be an array"],
    ['{"skills": {}}', "skills must be an array"],
    ['{"skills": ["foo"]}', "[name, boolean]"],
    ['{"skills": [["foo", false, 1]]}', "[name, boolean]"],
    ['{"skills": [["", false]]}', "non-empty"],
    ['{"skills": [["   ", false]]}', "non-empty"],
    ['{"skills": [[3, false]]}', "non-empty"],
    ['{"skills": [["foo", "off"]]}', "must be a boolean"],
    ['{"skills": [["foo", true], ["foo", false]]}', "duplicate skill rule: foo"],
  ])("rejects %s instead of falling back to global config", async (source, message) => {
    // Arrange
    await writeFile(project, source);
    await writeFile(configPath(cwd, "global", agentDir), "{}");

    // Act / Assert
    await expect(loadConfig(cwd, agentDir)).rejects.toThrow(message);
    await expect(loadConfig(cwd, agentDir)).rejects.toThrow(project);
  });
});

describe("saving", () => {
  it.each(["project", "global"] as const)("creates a %s config and its parent directories", async (scope) => {
    // Arrange
    await rm(scope === "project" ? join(cwd, ".pi") : agentDir, { recursive: true });
    const config = { enabled: false, skills: [["review", false] as [string, boolean]] };

    // Act
    const file = await saveConfig(cwd, scope, config, agentDir);

    // Assert
    expect(file).toBe(configPath(cwd, scope, agentDir));
    expect(parseConfig(await readFile(file, "utf8"))).toEqual(config);
    expect(await readdir(scope === "project" ? join(cwd, ".pi") : agentDir)).toEqual(["pi-skill-manager.jsonc"]);
  });

  it("preserves comments on retained rules, unrelated fields and CRLF line endings", async () => {
    // Arrange
    const source =
      '{\r\n  // overall\r\n  "enabled": true,\r\n  "extra": 42,\r\n  "skills": [\r\n    ["review", false], // keep me\r\n    ["obsolete", false],\r\n  ],\r\n}\r\n';
    await writeFile(project, source);

    // Act
    await saveConfig(
      cwd,
      "project",
      {
        enabled: false,
        skills: [
          ["review", true],
          ["new", false],
        ],
      },
      agentDir,
    );
    const saved = await readFile(project, "utf8");

    // Assert
    expect(saved).toContain("// overall");
    expect(saved).toContain("// keep me");
    expect(saved.replaceAll("\r\n", "")).not.toContain("\n");
    expect(parseConfig(saved)).toEqual({
      enabled: false,
      extra: 42,
      skills: [
        ["review", true],
        ["new", false],
      ],
    });
  });

  it.each([
    '["one", false], ["two", true], ["three", false]',
    '["one", false], // first\n ["two", true], /* second */ ["three", false],',
  ])("can remove every rule without invalidating JSONC: %s", async (rules) => {
    // Arrange
    await writeFile(project, `{"skills": [${rules}]}`);

    // Act
    await saveConfig(cwd, "project", { enabled: true, skills: [] }, agentDir);

    // Assert
    expect(await loadConfig(cwd, agentDir)).toEqual({ enabled: true, skills: [] });
  });

  it("does not overwrite an invalid existing file", async () => {
    // Arrange
    await writeFile(project, "{broken");

    // Act / Assert
    await expect(saveConfig(cwd, "project", { enabled: true, skills: [] }, agentDir)).rejects.toThrow("could not save");
    expect(await readFile(project, "utf8")).toBe("{broken");
    expect(await readdir(join(cwd, ".pi"))).toEqual(["pi-skill-manager.jsonc"]);
  });

  it("reports a write failure without leaving temporary files", async () => {
    // Arrange
    const blocked = join(root, "blocked");
    await writeFile(blocked, "not a directory");

    // Act / Assert
    await expect(saveConfig(blocked, "project", { enabled: true, skills: [] }, agentDir)).rejects.toThrow(
      "could not save",
    );
    expect(await readFile(blocked, "utf8")).toBe("not a directory");
  });
});
