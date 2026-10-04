import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import * as files from "@pi-pack/shared/files";
import { configPaths, createConfigLoader, parseConfig } from "@pi-pack/shared/config";

let root: string;
let cwd: string;
let agentDir: string;
let projectFile: string;
let globalFile: string;
const validate = vi.fn((value: Record<string, unknown>) => value);
const defaults = vi.fn(() => ({ items: [] as string[] }));
const load = createConfigLoader({ name: "example", knownKeys: ["items", "globalOnly"], defaults, validate });

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
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("configuration paths", () => {
  it.each(["example", "pi-openai"])("builds project and global paths for %s", (name) => {
    // Act
    const paths = configPaths(name, cwd, agentDir);

    // Assert
    expect(paths).toEqual({
      global: join(agentDir, `${name}.jsonc`),
      project: join(cwd, ".pi", `${name}.jsonc`),
    });
  });

  it("uses the agent directory when no override is provided", () => {
    // Act
    const paths = configPaths("example", cwd);

    // Assert
    expect(paths).toEqual({
      global: join(getAgentDir(), "example.jsonc"),
      project: projectFile,
    });
  });
});

describe("configuration loading", () => {
  it("creates independent defaults without validating when files are absent", async () => {
    // Act
    const first = await load(cwd, { projectTrusted: true, agentDir });
    const second = await load(cwd, { projectTrusted: true, agentDir });

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
    const global = await load(cwd, { projectTrusted: true, agentDir });
    await writeFile(projectFile, "{}");
    const project = await load(cwd, { projectTrusted: true, agentDir });

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
    const result = load(cwd, { projectTrusted: true, agentDir });

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
    const result = load(cwd, { projectTrusted: true, agentDir });

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
    await expect(load(cwd, { projectTrusted: true, agentDir })).rejects.toThrow(
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
    const result = load(cwd, { projectTrusted: true, agentDir });

    // Assert
    await expect(result).rejects.toThrow(`example: could not read ${file}:`);
    await expect(result).rejects.toHaveProperty("cause", expect.objectContaining({ code: "EISDIR" }));
    expect(validate).not.toHaveBeenCalled();
    expect(defaults).not.toHaveBeenCalled();
  });
});

describe("configuration warnings", () => {
  it("uses UI warnings by default", async () => {
    // Arrange
    const notify = vi.fn();
    await writeFile(projectFile, '{"itmes":[]}');

    // Act
    await load(cwd, { projectTrusted: true, agentDir, ui: { notify } });

    // Assert
    expect(notify.mock.calls).toEqual([
      [`example: ${projectFile}: Unknown configuration entries: "itmes".`, "warning"],
    ]);
  });

  it("uses a custom reporter instead of the default UI warning", async () => {
    // Arrange
    const notify = vi.fn();
    const onWarning = vi.fn();
    await writeFile(projectFile, '{"itmes":[]}');

    // Act
    await load(cwd, { projectTrusted: true, agentDir, ui: { notify }, onWarning });

    // Assert
    expect(onWarning.mock.calls).toEqual([[`example: ${projectFile}: Unknown configuration entries: "itmes".`]]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("remains usable without UI or a custom reporter", async () => {
    // Arrange
    await writeFile(projectFile, '{"itmes":[]}');

    // Act / Assert
    await expect(load(cwd, { projectTrusted: true, agentDir })).resolves.toEqual({ itmes: [] });
  });

  it.each(["project", "global"])("reports unknown entries in the selected %s file", async (scope) => {
    // Arrange
    const file = scope === "project" ? projectFile : globalFile;
    const onWarning = vi.fn();
    await writeFile(file, '{"items":[], "itmes":"secret", "constructor":true}');

    // Act
    const result = await load(cwd, { projectTrusted: true, agentDir, onWarning });

    // Assert
    expect(result.items).toEqual([]);
    expect(validate).toHaveBeenCalledOnce();
    expect(onWarning.mock.calls).toEqual([
      [`example: ${file}: Unknown configuration entries: "itmes", "constructor".`],
    ]);
  });

  it("does not inspect a global file shadowed by project configuration", async () => {
    // Arrange
    const onWarning = vi.fn();
    await writeFile(globalFile, '{"itmes":[]}');
    await writeFile(projectFile, '{"items":[]}');

    // Act
    await load(cwd, { projectTrusted: true, agentDir, onWarning });

    // Assert
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("does not warn when defaults are used", async () => {
    // Arrange
    const onWarning = vi.fn();

    // Act
    await load(cwd, { projectTrusted: true, agentDir, onWarning });

    // Assert
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("reports only top-level unknown keys and preserves the parsed object", () => {
    // Arrange
    const onWarning = vi.fn();
    const source = '{"items":{"nested":true}, "itmes":42}';

    // Act
    const result = parseConfig(source, { knownKeys: ["items"], onWarning });

    // Assert
    expect(result).toEqual({ items: { nested: true }, itmes: 42 });
    expect(onWarning.mock.calls).toEqual([['Unknown configuration entries: "itmes".']]);
  });

  it("keeps parsing usable without a warning callback", () => {
    // Act / Assert
    expect(parseConfig('{"itmes":42}', { knownKeys: ["items"] })).toEqual({ itmes: 42 });
  });

  it("rejects malformed input without reporting unknown entries", () => {
    // Arrange
    const onWarning = vi.fn();

    // Act / Assert
    expect(() => parseConfig('{"itmes":', { knownKeys: ["items"], onWarning })).toThrow();
    expect(onWarning).not.toHaveBeenCalled();
  });
});

describe("project trust", () => {
  it.each(["valid", "malformed", "unreadable"])("ignores %s project configuration when untrusted", async (kind) => {
    // Arrange
    await writeFile(globalFile, '{"items":["global"]}');
    if (kind === "unreadable") {
      await mkdir(projectFile);
    } else {
      await writeFile(projectFile, kind === "valid" ? '{"items":["project"],"unknown":true}' : "{invalid");
    }
    const read = vi.spyOn(files, "readOptionalFile");
    const onWarning = vi.fn();

    // Act
    const result = await load(cwd, { projectTrusted: false, agentDir, onWarning });

    // Assert
    expect(result).toEqual({ items: ["global"] });
    expect(read.mock.calls).toEqual([[globalFile]]);
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("uses defaults when untrusted and only project configuration exists", async () => {
    // Arrange
    await writeFile(projectFile, '{"items":["project"]}');

    // Act
    const result = await load(cwd, { projectTrusted: false, agentDir });

    // Assert
    expect(result).toEqual({ items: [] });
    expect(defaults).toHaveBeenCalledOnce();
    expect(validate).not.toHaveBeenCalled();
  });
});
