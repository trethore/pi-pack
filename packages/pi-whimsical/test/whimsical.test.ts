import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DefaultResourceLoader,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadConfig } from "#src/config";
import whimsical from "#src/index";
import { defaultMessages } from "#src/messages";

let root: string;
let cwd: string;
let agentDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "whimsical-"));
  cwd = join(root, "project");
  agentDir = join(root, "agent");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  await Promise.all([mkdir(join(cwd, ".pi"), { recursive: true }), mkdir(agentDir)]);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

async function configure(source: string, global = false): Promise<void> {
  await writeFile(join(global ? agentDir : join(cwd, ".pi"), "pi-whimsical.jsonc"), source);
}

function harness(hasUI = true) {
  const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
  const setWorkingMessage = vi.fn();
  const notify = vi.fn();
  const api = {
    on(name: string, handler: (event: never, ctx: ExtensionContext) => unknown) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;
  const isProjectTrusted = vi.fn(() => true);
  const ctx = { cwd, hasUI, isProjectTrusted, ui: { setWorkingMessage, notify } } as unknown as ExtensionContext;
  whimsical(api);
  return {
    isProjectTrusted,
    notify,
    setWorkingMessage,
    async emit(name: string) {
      const handler = handlers.get(name);
      if (!handler) {
        throw new Error(`Missing handler: ${name}`);
      }
      await handler({} as never, ctx);
    },
  };
}

it("enables built-in messages when no configuration exists", async () => {
  // Act
  const config = await loadConfig(cwd, { projectTrusted: true, agentDir });

  // Assert
  expect(config).toEqual({ enabled: true, messages: [] });
});

it("reads global JSONC with comments and trailing commas", async () => {
  // Arrange
  await configure('{ // custom\n "messages": ["Thinking...",], }', true);

  // Act / Assert
  await expect(loadConfig(cwd, { projectTrusted: true, agentDir })).resolves.toEqual({
    enabled: true,
    messages: ["Thinking..."],
  });
});

it("uses project configuration instead of merging with global configuration", async () => {
  // Arrange
  await configure('{"messages":["Global..."]}', true);
  await configure('{"enabled":false}');

  // Act / Assert
  await expect(loadConfig(cwd, { projectTrusted: true, agentDir })).resolves.toEqual({ enabled: false, messages: [] });
});

it.each([
  ["{", "at offset"],
  ["null", "configuration object"],
  ["[]", "configuration object"],
  ['{"enabled":"yes"}', "enabled must be a boolean"],
  ['{"messages":null}', "messages must be an array of strings"],
  ['{"messages":"hello"}', "messages must be an array of strings"],
  ['{"messages":[42]}', "messages must be an array of strings"],
])("rejects invalid configuration %s without global fallback", async (source, reason) => {
  // Arrange
  await configure(source);
  await configure("{}", true);

  // Act / Assert
  await expect(loadConfig(cwd, { projectTrusted: true, agentDir })).rejects.toThrow(reason);
  await expect(loadConfig(cwd, { projectTrusted: true, agentDir })).rejects.toThrow(
    join(cwd, ".pi", "pi-whimsical.jsonc"),
  );
});

it("reports unreadable configuration", async () => {
  // Arrange
  await mkdir(join(cwd, ".pi", "pi-whimsical.jsonc"));

  // Act / Assert
  await expect(loadConfig(cwd, { projectTrusted: true, agentDir })).rejects.toThrow("could not read");
});

it.each(["{}", '{"messages":[]}'])("uses the supplied built-in list for %s", async (source) => {
  // Arrange
  await configure(source);
  const extension = harness();
  vi.spyOn(Math, "random").mockReturnValue(0);
  await extension.emit("session_start");

  // Act
  await extension.emit("turn_start");

  // Assert
  expect(defaultMessages).toHaveLength(245);
  expect(extension.setWorkingMessage).toHaveBeenCalledWith("Schlepping...");
});

it("selects a new random custom message each turn and resets after each turn", async () => {
  // Arrange
  await configure('{"messages":["First...", "Last..."]}');
  const extension = harness();
  vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.999);
  await extension.emit("session_start");

  // Act
  await extension.emit("turn_start");
  await extension.emit("turn_end");
  await extension.emit("turn_start");
  await extension.emit("turn_end");

  // Assert
  expect(extension.setWorkingMessage.mock.calls).toEqual([["First..."], [], ["Last..."], []]);
});

it.each([
  [false, true],
  [true, false],
])("does not touch the UI when enabled=%s and hasUI=%s", async (enabled, hasUI) => {
  // Arrange
  await configure(JSON.stringify({ enabled }));
  const extension = harness(hasUI);
  await extension.emit("session_start");

  // Act
  await extension.emit("turn_start");
  await extension.emit("turn_end");
  await extension.emit("session_shutdown");

  // Assert
  expect(extension.setWorkingMessage).not.toHaveBeenCalled();
});

it("clears an active message on shutdown", async () => {
  // Arrange
  await configure('{"messages":["Busy..."]}');
  const extension = harness();
  await extension.emit("session_start");
  await extension.emit("turn_start");

  // Act
  await extension.emit("session_shutdown");

  // Assert
  expect(extension.setWorkingMessage.mock.calls).toEqual([["Busy..."], []]);
});

it("reloads configuration at session start", async () => {
  // Arrange
  await configure('{"messages":["Busy..."]}');
  const extension = harness();
  await extension.emit("session_start");
  await extension.emit("turn_start");
  await extension.emit("turn_end");
  extension.setWorkingMessage.mockClear();
  await configure('{"enabled":false}');

  // Act
  await extension.emit("session_start");
  await extension.emit("turn_start");

  // Assert
  expect(extension.setWorkingMessage).not.toHaveBeenCalled();
});

it("loads the package entry and shared imports through Pi's TypeScript loader", async () => {
  // Arrange
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: SettingsManager.inMemory(),
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  });

  // Act
  await loader.reload();
  const result = loader.getExtensions();

  // Assert
  expect(result.errors).toEqual([]);
  expect(result.extensions.some((extension) => extension.handlers.has("turn_start"))).toBe(true);
});

it("warns on session start and reload while still applying known entries", async () => {
  // Arrange
  await configure('{"messages":["Thinking..."], "mesages":["secret"]}');
  const extension = harness();

  // Act
  await extension.emit("session_start");
  await extension.emit("turn_start");
  await extension.emit("session_start");

  // Assert
  expect(extension.setWorkingMessage).toHaveBeenCalledWith("Thinking...");
  expect(extension.notify).toHaveBeenCalledTimes(2);
  expect(extension.notify).toHaveBeenLastCalledWith(
    `pi-whimsical: ${join(cwd, ".pi", "pi-whimsical.jsonc")}: Unknown configuration entries: "mesages".`,
    "warning",
  );
});

it.each(['{"enabled":false,"unknown":true}', "{invalid"])(
  "uses global messages without reading untrusted project configuration %s",
  async (source) => {
    // Arrange
    await configure('{"messages":["Global..."]}', true);
    await configure(source);
    const extension = harness();
    extension.isProjectTrusted.mockReturnValue(false);

    // Act
    await extension.emit("session_start");
    await extension.emit("turn_start");

    // Assert
    expect(extension.setWorkingMessage).toHaveBeenCalledWith("Global...");
    expect(extension.notify).not.toHaveBeenCalled();
  },
);

it("replaces project messages with global messages when reloading untrusted", async () => {
  // Arrange
  await configure('{"messages":["Global..."]}', true);
  await configure('{"messages":["Project..."]}');
  const extension = harness();
  await extension.emit("session_start");
  await extension.emit("turn_start");
  await extension.emit("turn_end");
  extension.isProjectTrusted.mockReturnValue(false);

  // Act
  await extension.emit("session_start");
  await extension.emit("turn_start");

  // Assert
  expect(extension.setWorkingMessage.mock.calls).toEqual([["Project..."], [], ["Global..."]]);
  expect(extension.notify).not.toHaveBeenCalled();
});
