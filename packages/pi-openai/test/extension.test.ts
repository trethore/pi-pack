import type { Destination } from "#src/constants";
import { fileURLToPath } from "node:url";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { parseConfig } from "@pi-pack/shared/config";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import openai from "#src/index";
import { environmentNames } from "#src/settings";
import { createWorkspace, model } from "#test/support";

let workspace: Awaited<ReturnType<typeof createWorkspace>>;
beforeEach(async () => {
  workspace = await createWorkspace();
  for (const name of Object.values(environmentNames)) {
    vi.stubEnv(name, undefined);
  }
  vi.stubEnv("PI_CODING_AGENT_DIR", workspace.agentDir);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await workspace.dispose();
});

function harness(mode: ExtensionContext["mode"] = "tui") {
  const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
  const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
  const notify = vi.fn();
  const appendEntry = vi.fn();
  const registerEntryRenderer = vi.fn();
  const api = {
    on(name: string, handler: (event: never, ctx: ExtensionContext) => unknown) {
      handlers.set(name, handler);
    },
    registerCommand(name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) {
      commands.set(name, command);
    },
    registerEntryRenderer,
    appendEntry,
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: workspace.cwd,
    mode,
    hasUI: mode === "tui",
    ui: { notify },
    model,
    thinkingLevel: "high",
  } as unknown as ExtensionCommandContext;
  openai(api);
  return {
    notify,
    appendEntry,
    registerEntryRenderer,
    commands,
    ctx,
    async emit(name: string, event: unknown = {}) {
      const handler = handlers.get(name);
      if (!handler) {
        throw new Error(`Missing handler: ${name}`);
      }
      return await handler(event as never, ctx);
    },
    async command(args: string) {
      const command = commands.get("pi-openai");
      if (!command) {
        throw new Error("Missing command");
      }
      await command.handler(args, ctx);
    },
  };
}

it("registers one command root, completions, and a display-only status renderer", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");

  // Act
  await extension.command("");
  await extension.command("status");

  // Assert
  expect([...extension.commands.keys()]).toEqual(["pi-openai"]);
  expect(extension.commands.get("pi-openai")?.getArgumentCompletions?.("serviceTier p")).toEqual([
    { value: "serviceTier priority", label: "priority" },
  ]);
  expect(extension.registerEntryRenderer).toHaveBeenCalledWith("pi-openai-status", expect.any(Function));
  expect(extension.appendEntry).toHaveBeenCalledTimes(2);
  expect(extension.appendEntry.mock.calls[0]).toEqual(extension.appendEntry.mock.calls[1]);
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("Save destination: **global**"),
  );
});

it("commands override environment and reset exposes lower layers again", async () => {
  // Arrange
  await workspace.write("global", '{"verbosity":"high"}');
  vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
  const extension = harness();
  await extension.emit("session_start");
  const event = { payload: { model: model.id, input: [] } };

  // Act / Assert
  expect(await extension.emit("before_provider_request", event)).toHaveProperty("text.verbosity", "low");
  await extension.command("verbosity null");
  expect(await extension.emit("before_provider_request", event)).toBeUndefined();
  await extension.command("reset verbosity");
  expect(await extension.emit("before_provider_request", event)).toHaveProperty("text.verbosity", "low");
  await extension.command("enabled false");
  expect(await extension.emit("before_provider_request", event)).toBeUndefined();
  await extension.command("reset");
  expect(await extension.emit("before_provider_request", event)).toHaveProperty("text.verbosity", "low");
  expect(parseConfig(await workspace.read("global"))).toEqual({ verbosity: "high" });
});

it("applies runtime commands to subsequent requests and model changes", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity low");
  extension.ctx.model = {
    ...extension.ctx.model,
    provider: "custom",
    baseUrl: "https://custom.example/v1",
  } as ExtensionContext["model"];
  const event = { payload: { model: model.id, input: [] } };

  // Act / Assert
  expect(await extension.emit("before_provider_request", event)).toBeUndefined();
  await extension.command("allowUnsupported true");
  expect(await extension.emit("before_provider_request", event)).toHaveProperty("text.verbosity", "low");
  await extension.command("status");
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("support checks bypassed"),
  );
});

const saveCases: Array<[string, Destination | undefined, Destination]> = [
  ["save", undefined, "global"],
  ["save", "global", "global"],
  ["save", "project", "project"],
  ["save global", "project", "global"],
  ["save project", undefined, "project"],
];
it.each(saveCases)("%s with existing %s saves effective state to %s", async (command, existing, destination) => {
  // Arrange
  if (existing) {
    await workspace.write(existing, '{ // retain\n "futureSetting":42, "reasoningSummary":"detailed" }');
  }
  vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("webSearch true");
  await extension.command("reasoningSummary null");

  // Act
  await extension.command(command);
  const saved = parseConfig(await workspace.read(destination));

  // Assert
  expect(saved).toMatchObject({
    verbosity: "low",
    reasoningSummary: null,
    webSearch: true,
    enabled: true,
    allowUnsupported: false,
    serviceTier: "default",
  });
  expect(extension.notify).toHaveBeenLastCalledWith(
    destination === "global" ? "pi-openai: Saved globally." : "pi-openai: Saved on this project.",
    "info",
  );
  expect(extension.notify.mock.calls.flat().join("\n")).not.toContain(workspace.root);
});

it("updates the saved layer and destination shown by status", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity high");

  // Act
  await extension.command("save project");
  await extension.command("reset");
  await extension.command("status");

  // Assert
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("| verbosity | `high` | project |"),
  );
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("Save destination: **project**"),
  );
});

it("keeps environment precedence after saving globally", async () => {
  // Arrange
  vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity high");
  await extension.command("save global");

  // Act
  await extension.command("reset verbosity");
  await extension.command("status");

  // Assert
  expect(parseConfig(await workspace.read("global"))).toHaveProperty("verbosity", "high");
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("| verbosity | `low` | environment |"),
  );
});

it("reloads configuration and clears unsaved runtime overrides at session start", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity high");
  await workspace.write("project", '{"verbosity":"medium"}');

  // Act
  await extension.emit("session_start");
  await extension.command("status");

  // Assert
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("| verbosity | `medium` | project |"),
  );
});

it("disables overrides after a configuration failure instead of using stale state", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity low");
  await workspace.write("project", '{"webSearch":null}');

  // Act / Assert
  await expect(extension.emit("session_start")).rejects.toThrow("pi-openai: Invalid project configuration");
  expect(await extension.emit("before_provider_request", { payload: { model: model.id, input: [] } })).toBeUndefined();
  await extension.command("save");
  expect(extension.notify).toHaveBeenLastCalledWith(expect.stringContaining("Configuration is unavailable"), "error");
});

it("reports command and save failures without changing current settings", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity high");

  // Act
  await extension.command("verbosity invalid");
  await workspace.write("global", "{invalid");
  await extension.command("save");
  await extension.command("status");

  // Assert
  expect(extension.notify).toHaveBeenCalledWith(expect.stringContaining("verbosity must be one of"), "error");
  expect(extension.notify).toHaveBeenCalledWith(expect.stringContaining("Invalid global configuration"), "error");
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("| verbosity | `high` | command |"),
  );
  expect(await workspace.read("global")).toBe("{invalid");
});

it.each(["print", "json", "rpc"] as const)(
  "applies environment overrides in %s mode without UI components",
  async (mode) => {
    // Arrange
    vi.stubEnv("PI_OPENAI_REASONING_SUMMARY", "none");
    const extension = harness(mode);
    await extension.emit("session_start");
    const payload = { model: model.id, input: [], reasoning: { summary: "auto", effort: "high" } };

    // Act
    const result = await extension.emit("before_provider_request", { payload });
    await extension.command("status");

    // Assert
    expect(result).toEqual({ ...payload, reasoning: { effort: "high" } });
    expect(extension.appendEntry).not.toHaveBeenCalled();
    expect(extension.notify).toHaveBeenCalledWith(
      expect.stringContaining("| reasoningSummary | `none` | environment |"),
      "info",
    );
  },
);

it("loads through Pi's TypeScript loader with all workspace dependencies", async () => {
  // Arrange
  const loader = new DefaultResourceLoader({
    cwd: workspace.cwd,
    agentDir: workspace.agentDir,
    settingsManager: SettingsManager.inMemory(),
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  });

  // Act
  await loader.reload();
  const loaded = loader.getExtensions();

  // Assert
  expect(loaded.errors).toEqual([]);
  expect(loaded.extensions.some((extension) => extension.commands.has("pi-openai"))).toBe(true);
  expect(loaded.extensions.some((extension) => extension.handlers.has("before_provider_request"))).toBe(true);
});

it.each(["sk-proj-test", "chatgpt-access-token"])(
  "modifies real Pi OpenAI requests using %s without restoring auth-rejected fields",
  async (apiKey) => {
    // Arrange
    vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
    vi.stubEnv("PI_OPENAI_REASONING_SUMMARY", "none");
    vi.stubEnv("PI_OPENAI_WEB_SEARCH", "true");
    vi.stubEnv("PI_OPENAI_SERVICE_TIER", "priority");
    const extension = harness("print");
    await extension.emit("session_start");
    const runtime = await ModelRuntime.create({
      authPath: workspace.agentDir + "/auth.json",
      modelsPath: null,
      modelsStorePath: workspace.agentDir + "/models-cache.json",
      refreshOnCreate: false,
    });
    const requestModel = runtime.getModel("openai", model.id);
    if (!requestModel) {
      throw new Error("Missing built-in OpenAI model");
    }
    let sent: unknown;
    const fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      if (typeof init?.body !== "string") {
        throw new Error("Expected a JSON request body");
      }
      sent = JSON.parse(init.body) as unknown;
      return Promise.resolve(
        new Response('{"error":{"message":"Test response"}}', {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      );
    });

    // Act
    await runtime
      .streamSimple(
        requestModel,
        { messages: [] },
        {
          apiKey,
          fetch,
          maxRetries: 0,
          maxTokens: 1024,
          temperature: 0.5,
          reasoning: "high",
          onPayload: (payload) => extension.emit("before_provider_request", { payload }),
        },
      )
      .result();

    // Assert
    expect(fetch).toHaveBeenCalledOnce();
    expect(sent).toMatchObject({
      text: { verbosity: "low" },
      reasoning: { effort: "high" },
      service_tier: "priority",
      tools: [{ type: "web_search" }],
    });
    expect(sent).not.toHaveProperty("reasoning.summary");
    if (apiKey.startsWith("sk-")) {
      expect(sent).toMatchObject({ max_output_tokens: 1024, temperature: 0.5 });
    } else {
      expect(sent).not.toHaveProperty("max_output_tokens");
      expect(sent).not.toHaveProperty("temperature");
    }
  },
);
