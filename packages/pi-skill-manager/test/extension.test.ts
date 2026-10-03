import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  formatSkillsForPrompt,
  getAgentDir,
  SessionManager,
  SettingsManager,
  type BeforeAgentStartEvent,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configPath, loadConfig } from "../src/config.ts";
import skillManager from "../src/index.ts";
import { selectionEntryType } from "../src/selection.ts";
import type { ManagerResult } from "../src/ui.ts";
import { skill } from "./fixtures.ts";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "skill-manager-extension-"));
  await mkdir(join(cwd, ".pi"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(cwd, { recursive: true, force: true });
  await rm(configPath(cwd, "global"), { force: true });
});

function harness(manager = SessionManager.inMemory(cwd), mode = "tui") {
  const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
  const commands = new Map<string, RegisteredCommand>();
  const notify = vi.fn();
  const custom = vi.fn<() => Promise<ManagerResult | undefined>>();
  const waitForIdle = vi.fn(async () => {});
  const skills = [skill("review"), skill("tests")];
  const ctx = {
    cwd,
    mode,
    sessionManager: manager,
    ui: { notify, custom },
    waitForIdle,
    getSystemPromptOptions: () => ({ cwd, skills }),
  } as unknown as ExtensionCommandContext;
  const api = {
    on(name: string, handler: (event: never, ctx: ExtensionContext) => unknown) {
      handlers.set(name, handler);
    },
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    appendEntry(name: string, data: unknown) {
      manager.appendCustomEntry(name, data);
    },
  } as unknown as ExtensionAPI;
  skillManager(api);
  return {
    manager,
    notify,
    custom,
    waitForIdle,
    async start() {
      await handlers.get("session_start")?.({} as never, ctx);
    },
    async run() {
      const event = { type: "before_agent_start", systemPromptOptions: { skills } } as BeforeAgentStartEvent;
      await handlers.get("before_agent_start")?.(event as never, ctx);
      return event.systemPromptOptions.skills;
    },
    async command(result?: ManagerResult) {
      custom.mockResolvedValueOnce(result);
      await commands.get("skill-manager")?.handler("", ctx);
    },
  };
}

async function config(source: string): Promise<void> {
  await writeFile(configPath(cwd, "project"), source);
}

describe("extension behavior", () => {
  it.each([
    { project: false, global: false, scope: "global" as const, message: "Pi Skill manager: Saved globally." },
    { project: false, global: true, scope: "global" as const, message: "Pi Skill manager: Saved globally." },
    { project: true, global: false, scope: "project" as const, message: "Pi Skill manager: Saved for this project." },
    { project: true, global: true, scope: "project" as const, message: "Pi Skill manager: Saved for this project." },
  ])("auto-saves to $scope (project=$project, global=$global) without exposing paths", async (scenario) => {
    // Arrange
    if (scenario.project) await config("{}");
    if (scenario.global) {
      await mkdir(getAgentDir(), { recursive: true });
      await writeFile(configPath(cwd, "global"), "{}");
    }
    const extension = harness();
    await extension.start();
    const selection = { enabled: true, skills: [["review", false] as [string, boolean]] };

    // Act
    await extension.command({ action: "save", config: selection });

    // Assert
    expect(extension.notify).toHaveBeenLastCalledWith(scenario.message, "info");
    expect(await loadConfig(cwd)).toEqual(selection);
    expect((await extension.run()).map((item) => item.name)).toEqual(["tests"]);
    if (scenario.project && scenario.global) {
      expect(await readFile(configPath(cwd, "global"), "utf8")).toBe("{}");
    }
    if (scenario.project && !scenario.global) {
      await expect(readFile(configPath(cwd, "global"))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("auto-saves after locking without changing the current selection or exposing paths", async () => {
    // Arrange
    const extension = harness();
    await extension.start();
    const original = await extension.run();

    // Act
    await extension.command({ action: "save", config: { enabled: true, skills: [["review", false]] } });

    // Assert
    expect(extension.notify).toHaveBeenLastCalledWith(
      "Pi Skill manager: Saved globally. Current session is locked; changes affect future sessions only.",
      "info",
    );
    expect((await extension.run()).map((item) => item.name)).toEqual(original.map((item) => item.name));
    expect(await loadConfig(cwd)).toEqual({ enabled: true, skills: [["review", false]] });
  });

  it.each([
    { action: "project" as const, message: "Pi Skill manager: Saved for this project." },
    { action: "global" as const, message: "Pi Skill manager: Saved globally." },
  ])("uses path-free confirmation for explicit $action saves", async ({ action, message }) => {
    // Arrange
    const extension = harness();
    await extension.start();

    // Act
    await extension.command({ action, config: { enabled: false, skills: [] } });

    // Assert
    expect(extension.notify).toHaveBeenLastCalledWith(message, "info");
  });

  it("applies saved rules before the first run and persists a non-prompt lock", async () => {
    // Arrange
    await config('{"skills": [["review", false]]}');
    const extension = harness();
    await extension.start();

    // Act
    const retained = await extension.run();

    // Assert
    expect(retained.map((item) => item.name)).toEqual(["tests"]);
    const entries = extension.manager.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "custom", customType: selectionEntryType, data: { locked: true } });
  });

  it("applies session-only edits without writing config and survives a runtime reload", async () => {
    // Arrange
    const extension = harness();
    await extension.start();
    await extension.command({ action: "session", config: { enabled: true, skills: [["review", false]] } });
    const reloaded = harness(extension.manager);

    // Act
    await reloaded.start();
    const retained = await reloaded.run();

    // Assert
    expect(retained.map((item) => item.name)).toEqual(["tests"]);
    await expect(readFile(configPath(cwd, "project"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(extension.waitForIdle).toHaveBeenCalled();
  });

  it("saves after a run for future sessions without changing the locked prompt, even after reload", async () => {
    // Arrange
    const extension = harness();
    await extension.start();
    const first = await extension.run();

    // Act
    await extension.command({ action: "project", config: { enabled: true, skills: [["review", false]] } });
    const reloaded = harness(extension.manager);
    await reloaded.start();
    const next = await reloaded.run();
    const fresh = harness();
    await fresh.start();

    // Assert
    expect(next.map((item) => item.name)).toEqual(first.map((item) => item.name));
    expect((await fresh.run()).map((item) => item.name)).toEqual(["tests"]);
    expect(extension.notify).toHaveBeenLastCalledWith(expect.stringContaining("future sessions only"), "info");
    expect(extension.manager.getEntries()).toHaveLength(1);
  });

  it("does not unlock when the extension is disabled in the file mid-session", async () => {
    // Arrange
    await config('{"skills": [["review", false]]}');
    const extension = harness();
    await extension.start();
    await extension.run();
    await config('{"enabled": false}');
    const reloaded = harness(extension.manager);

    // Act
    await reloaded.start();

    // Assert
    expect((await reloaded.run()).map((item) => item.name)).toEqual(["tests"]);
  });

  it("rejects session application if a run locked the session while the picker was open", async () => {
    // Arrange
    const extension = harness();
    await extension.start();
    await extension.run();

    // Act
    await extension.command({ action: "session", config: { enabled: true, skills: [["review", false]] } });

    // Assert
    expect(extension.notify).toHaveBeenLastCalledWith(expect.stringContaining("locked"), "error");
    expect((await extension.run()).map((item) => item.name)).toEqual(["review", "tests"]);
  });

  it("warns when a global save is shadowed and does not apply it to the project session", async () => {
    // Arrange
    await config("{}");
    const extension = harness();
    await extension.start();

    // Act
    await extension.command({ action: "global", config: { enabled: true, skills: [["review", false]] } });

    // Assert
    expect(extension.notify).toHaveBeenLastCalledWith(
      expect.stringContaining("project config takes precedence"),
      "warning",
    );
    expect((await extension.run()).map((item) => item.name)).toEqual(["review", "tests"]);
    await rm(configPath(cwd, "project"));
    expect(await loadConfig(cwd)).toEqual({ enabled: true, skills: [["review", false]] });
  });

  it("reports a save failure and leaves the session selection unchanged", async () => {
    // Arrange
    const extension = harness();
    await extension.start();
    extension.custom.mockImplementationOnce(async () => {
      await mkdir(configPath(cwd, "project"));
      return { action: "project", config: { enabled: true, skills: [["review", false]] } };
    });

    // Act
    await extension.command();

    // Assert
    expect(extension.notify).toHaveBeenLastCalledWith(expect.stringContaining("could not save"), "error");
    expect((await extension.run()).map((item) => item.name)).toEqual(["review", "tests"]);
  });

  it("does not apply a saved draft if the session changes while the config is being written", async () => {
    // Arrange
    const extension = harness();
    await extension.start();
    const sessionId = extension.manager.getSessionId();
    vi.spyOn(extension.manager, "getSessionId")
      .mockReturnValueOnce(sessionId)
      .mockReturnValueOnce(sessionId)
      .mockReturnValue("different-session");

    // Act
    await extension.command({ action: "save", config: { enabled: true, skills: [["review", false]] } });

    // Assert
    expect(await loadConfig(cwd)).toEqual({ enabled: true, skills: [["review", false]] });
    expect(extension.manager.getEntries()).toEqual([]);
    expect(extension.notify).toHaveBeenLastCalledWith(
      "Pi Skill manager: Saved globally. Session changed; changes apply to future sessions only.",
      "info",
    );
    expect((await extension.run()).map((item) => item.name)).toEqual(["review", "tests"]);
  });

  it("does nothing when cancelled", async () => {
    // Arrange
    const extension = harness();
    await extension.start();

    // Act
    await extension.command();

    // Assert
    expect(extension.manager.getEntries()).toEqual([]);
    expect(extension.notify).not.toHaveBeenCalled();
  });

  it.each(["rpc", "print", "json"])("does not open custom terminal UI in %s mode", async (mode) => {
    // Arrange
    const extension = harness(undefined, mode);
    await extension.start();

    // Act
    await extension.command();

    // Assert
    expect(extension.custom).not.toHaveBeenCalled();
    expect(extension.notify).toHaveBeenCalledWith(expect.stringContaining("requires TUI mode"), "error");
  });

  it("retains the lock even if reloading an invalid config reports an error", async () => {
    // Arrange
    await config('{"skills": [["review", false]]}');
    const extension = harness();
    await extension.start();
    await extension.run();
    await config("{invalid");
    const reloaded = harness(extension.manager);

    // Act / Assert
    await expect(reloaded.start()).rejects.toThrow("invalid configuration");
    expect((await reloaded.run()).map((item) => item.name)).toEqual(["tests"]);
  });
});

it("loads the package through Pi's TypeScript loader without removing skills or their manual commands", async () => {
  // Arrange
  const skillDir = join(cwd, ".pi", "skills", "review");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "---\nname: review\ndescription: Review code\n---\nReview this code.\n");
  await config('{"skills": [["review", false]]}');
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    settingsManager: SettingsManager.inMemory(),
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  });

  // Act
  await loader.reload();

  // Assert
  const extensions = loader.getExtensions();
  expect(extensions.errors).toEqual([]);
  expect(extensions.extensions.some((extension) => extension.commands.has("skill-manager"))).toBe(true);
  expect(loader.getSkills().skills.map((item) => item.name)).toContain("review");
});

it("retains the advertised selection and manual command through a real Pi runtime reload", async () => {
  // Arrange
  await config('{"skills": [["review", false]]}');
  let api: ExtensionAPI | undefined;
  let context: ExtensionContext | undefined;
  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    settingsManager,
    skillsOverride: () => ({ skills: [skill("review"), skill("tests")], diagnostics: [] }),
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    extensionFactories: [
      (pi) => {
        api = pi;
        pi.on("session_start", (_event, ctx) => {
          context = ctx;
        });
      },
    ],
    additionalExtensionPaths: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir: getAgentDir(),
    resourceLoader: loader,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
  });
  const errors = vi.fn();

  async function beforeRun(): Promise<string> {
    const event: BeforeAgentStartEvent = {
      type: "before_agent_start",
      prompt: "Test",
      systemPrompt: "",
      systemPromptOptions: {
        cwd,
        selectedTools: ["read"],
        toolSnippets: {},
        toolGuidelines: {},
        promptGuidelines: [],
        appendSystemPrompt: "",
        sections: {},
        contextFiles: [],
        skills: loader.getSkills().skills,
      },
    };
    const handler = loader
      .getExtensions()
      .extensions.find((extension) => extension.path.includes("pi-skill-manager"))
      ?.handlers.get("before_agent_start")?.[0];
    if (!handler || !context) throw new Error("Missing skill manager handler or session context");
    await handler(event, context);
    return formatSkillsForPrompt(event.systemPromptOptions.skills);
  }

  try {
    await session.bindExtensions({ onError: errors });
    const first = await beforeRun();
    await config('{"enabled": false}');

    // Act
    await session.reload();
    const next = await beforeRun();

    // Assert
    expect(next).toBe(first);
    expect(next).toContain("<name>tests</name>");
    expect(next).not.toContain("<name>review</name>");
    expect(api?.getCommands().map((command) => command.name)).toContain("skill:review");
    expect(errors).not.toHaveBeenCalled();
  } finally {
    session.dispose();
  }
});
