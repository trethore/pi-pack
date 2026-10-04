import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfigLoader } from "@pi-pack/shared/config";

let root: string;
let cwd: string;
let agentDir: string;
let projectFile: string;
let globalFile: string;
const validate = vi.fn((value: Record<string, unknown>) => value);
const defaults = vi.fn(() => ({ items: [] as string[] }));
const load = createConfigLoader({ name: "example", defaults, validate });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-pack-shared-"));
  cwd = join(root, "project");
  agentDir = join(root, "agent");
  projectFile = join(cwd, ".pi", "example.jsonc");
  globalFile = join(agentDir, "example.jsonc");
  await Promise.all([mkdir(join(cwd, ".pi"), { recursive: true }), mkdir(agentDir)]);
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("configuration loading", () => {
  it("creates independent defaults without validating when files are absent", async () => {
    // Act
    const first = await load(cwd, agentDir);
    const second = await load(cwd, agentDir);

    // Assert
    expect(first).toEqual({ items: [] });
    expect(first).not.toBe(second);
    expect(first.items).not.toBe(second.items);
    expect(defaults).toHaveBeenCalledTimes(2);
    expect(validate).not.toHaveBeenCalled();
  });

  it("reads global JSONC and replaces it completely when a project file appears", async () => {
    // Arrange
    await writeFile(globalFile, '{ // global\n "globalOnly": true, }');

    // Act
    const global = await load(cwd, agentDir);
    await writeFile(projectFile, "{}");
    const project = await load(cwd, agentDir);

    // Assert
    expect(global).toEqual({ globalOnly: true });
    expect(project).toEqual({});
    expect(validate).toHaveBeenCalledTimes(2);
    expect(defaults).not.toHaveBeenCalled();
  });

  it.each([
    ["", "at offset"],
    ["{", "at offset"],
    ["null", "Expected a configuration object"],
    ["[]", "Expected a configuration object"],
    ["true", "Expected a configuration object"],
    ['"text"', "Expected a configuration object"],
  ])("rejects invalid JSONC %s without validating or falling back", async (source, reason) => {
    // Arrange
    await writeFile(projectFile, source);
    await writeFile(globalFile, "{}");

    // Act
    const result = load(cwd, agentDir);

    // Assert
    await expect(result).rejects.toThrow(`example: invalid configuration in ${projectFile}:`);
    await expect(result).rejects.toThrow(reason);
    await expect(result).rejects.toHaveProperty("cause", expect.any(Error));
    expect(validate).not.toHaveBeenCalled();
    expect(defaults).not.toHaveBeenCalled();
  });

  it("preserves validation failures and does not fall back", async () => {
    // Arrange
    const cause = new Error("invalid setting");
    validate.mockImplementationOnce(() => {
      throw cause;
    });
    await writeFile(projectFile, "{}");
    await writeFile(globalFile, "{}");

    // Act
    const result = load(cwd, agentDir);

    // Assert
    await expect(result).rejects.toThrow(`example: invalid configuration in ${projectFile}: invalid setting`);
    await expect(result).rejects.toHaveProperty("cause", cause);
    expect(validate).toHaveBeenCalledOnce();
    expect(defaults).not.toHaveBeenCalled();
  });

  it("reports non-Error validation failures", async () => {
    // Arrange
    validate.mockImplementationOnce(() => {
      throw "invalid setting";
    });
    await writeFile(globalFile, "{}");

    // Act / Assert
    await expect(load(cwd, agentDir)).rejects.toThrow(
      `example: invalid configuration in ${globalFile}: invalid setting`,
    );
  });

  it.each(["project", "global"])("reports %s I/O failures instead of using defaults or fallback", async (scope) => {
    // Arrange
    const file = scope === "project" ? projectFile : globalFile;
    await mkdir(file);
    if (scope === "project") {
      await writeFile(globalFile, "{}");
    }

    // Act
    const result = load(cwd, agentDir);

    // Assert
    await expect(result).rejects.toThrow(`example: could not read ${file}:`);
    await expect(result).rejects.toHaveProperty("cause", expect.objectContaining({ code: "EISDIR" }));
    expect(validate).not.toHaveBeenCalled();
    expect(defaults).not.toHaveBeenCalled();
  });
});
