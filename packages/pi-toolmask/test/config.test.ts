import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { disabledConfig, loadConfig } from "../src/config.ts";

let directory: string;
let project: string;
let agentDir: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "pi-toolmask-config-"));
  project = path.join(directory, "project");
  agentDir = path.join(directory, "agent");
  mkdirSync(path.join(project, ".pi"), { recursive: true });
  mkdirSync(agentDir);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("configuration", () => {
  it("does not change tools without a configuration", async () => {
    // Act
    const config = await loadConfig(project, agentDir);

    // Assert
    expect(config).toEqual(disabledConfig);
  });

  it("accepts comments, trailing commas, and optional defaults", async () => {
    // Arrange
    writeFileSync(path.join(agentDir, "pi-toolmask.jsonc"), '{ // global\n "masks": ["*", "!read",], }');

    // Act
    const config = await loadConfig(project, agentDir);

    // Assert
    expect(config).toEqual({ enabled: true, masks: ["*", "!read"], enforceBeforeAgentStart: false });
  });

  it("replaces the global configuration with the project configuration", async () => {
    // Arrange
    writeFileSync(path.join(agentDir, "pi-toolmask.jsonc"), '{"masks": ["*"], "enforceBeforeAgentStart": true}');
    writeFileSync(path.join(project, ".pi", "pi-toolmask.jsonc"), '{"masks": ["bash"], "enabled": false}');

    // Act
    const config = await loadConfig(project, agentDir);

    // Assert
    expect(config).toEqual({ enabled: false, masks: ["bash"], enforceBeforeAgentStart: false });
  });

  it.each([
    ["{", "at offset"],
    ["null", "configuration object"],
    ["[]", "configuration object"],
    ['{"masks": [], "enabled": "yes"}', "enabled must be a boolean"],
    ['{"masks": [], "enforceBeforeAgentStart": 1}', "enforceBeforeAgentStart must be a boolean"],
    ["{}", "masks must be an array"],
    ['{"masks": "*"}', "masks must be an array"],
    ['{"masks": [1]}', "nonempty string"],
    ['{"masks": [""]}', "nonempty string"],
    ['{"masks": ["!"]}', "pattern after !"],
  ])("reports invalid project configuration %s without falling back", async (source, error) => {
    // Arrange
    const file = path.join(project, ".pi", "pi-toolmask.jsonc");
    writeFileSync(file, source);
    writeFileSync(path.join(agentDir, "pi-toolmask.jsonc"), '{"masks": []}');

    // Act / Assert
    await expect(loadConfig(project, agentDir)).rejects.toThrow(file);
    await expect(loadConfig(project, agentDir)).rejects.toThrow(error);
  });

  it("reports file access errors rather than treating them as missing", async () => {
    // Arrange
    const file = path.join(project, ".pi", "pi-toolmask.jsonc");
    mkdirSync(file);

    // Act / Assert
    await expect(loadConfig(project, agentDir)).rejects.toThrow(file);
  });
});
