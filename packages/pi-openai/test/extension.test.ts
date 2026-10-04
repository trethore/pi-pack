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
import { environmentNames } from "#src/config/settings";
import { createWorkspace, model } from "#test/support";

let workspace: Awaited<ReturnType<typeof createWorkspace>>;
beforeEach(async () => {
  workspace = await createWorkspace();
  for (const name of Object.values(environmentNames)) {
    vi.stubEnv(name, undefined);
  }
  vi.stubEnv("PI_CODING_AGENT_DIR", workspace.agentDir);
  vi.stubEnv("AZURE_OPENAI_DEPLOYMENT_NAME_MAP", undefined);
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
  expect(extension.commands.get("pi-openai")?.getArgumentCompletions?.("serviceTier f")).toEqual([
    { value: "serviceTier fast", label: "fast" },
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

it.each([
  ["verbosity medium", "verbosity = medium."],
  ["reset verbosity", "Reset verbosity."],
  ["reset", "Reset command overrides."],
])("reminds users to save after %s without changing config files", async (command, confirmation) => {
  // Arrange
  const config = '{"verbosity":"high"}';
  await workspace.write("global", config);
  await workspace.write("project", config);
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity low");

  // Act
  await extension.command(command);

  // Assert
  expect(extension.notify).toHaveBeenLastCalledWith(
    `pi-openai: ${confirmation} Use /pi-openai save to save the current settings.`,
    "info",
  );
  expect(await workspace.read("global")).toBe(config);
  expect(await workspace.read("project")).toBe(config);
});

it.each(["openai-responses", "custom-responses", "openai-codex-responses"])(
  "applies runtime support overrides to subsequent requests using %s",
  async (api) => {
    // Arrange
    const extension = harness();
    await extension.emit("session_start");
    await extension.command("verbosity low");
    extension.ctx.model = {
      ...extension.ctx.model,
      api,
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
    await extension.command("allowUnsupported false");
    expect(await extension.emit("before_provider_request", event)).toBeUndefined();
  },
);

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

it.each([
  { provider: "openai", apiKey: "sk-proj-test" },
  { provider: "openai", apiKey: "chatgpt-access-token" },
  { provider: "azure-openai-responses", apiKey: "azure-test" },
])(
  "modifies real Pi $provider requests using $apiKey without restoring auth-rejected fields",
  async ({ provider, apiKey }) => {
    // Arrange
    vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
    vi.stubEnv("PI_OPENAI_REASONING_SUMMARY", "none");
    vi.stubEnv("PI_OPENAI_WEB_SEARCH", "true");
    vi.stubEnv("PI_OPENAI_SERVICE_TIER", "fast");
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT_NAME_MAP", `${model.id}=production-assistant`);
    const extension = harness("print");
    await extension.emit("session_start");
    const runtime = await ModelRuntime.create({
      authPath: workspace.agentDir + "/auth.json",
      modelsPath: null,
      modelsStorePath: workspace.agentDir + "/models-cache.json",
      refreshOnCreate: false,
    });
    const builtInModel = runtime.getModel("openai", model.id);
    if (!builtInModel) {
      throw new Error("Missing built-in OpenAI model");
    }
    const requestModel =
      provider === "openai"
        ? builtInModel
        : {
            ...builtInModel,
            provider,
            api: "azure-openai-responses" as const,
            baseUrl: "https://example.openai.azure.com",
          };
    extension.ctx.model = requestModel;
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
      model: provider === "openai" ? model.id : "production-assistant",
      text: { verbosity: "low" },
      reasoning: { effort: "high" },
    });
    expect(sent).not.toHaveProperty("reasoning.summary");
    if (provider === "openai") {
      expect(sent).toMatchObject({ service_tier: "fast", tools: [{ type: "web_search" }] });
    } else {
      expect(sent).not.toHaveProperty("service_tier");
      expect(sent).not.toHaveProperty("tools");
    }
    if (provider === "azure-openai-responses" || apiKey.startsWith("sk-")) {
      expect(sent).toMatchObject({ max_output_tokens: 1024, temperature: 0.5 });
    } else {
      expect(sent).not.toHaveProperty("max_output_tokens");
      expect(sent).not.toHaveProperty("temperature");
    }
  },
);

it("warns about unknown entries in both config layers without disabling known settings", async () => {
  // Arrange
  await workspace.write("global", '{"verbosity":"high", "verbosty":"secret"}');
  await workspace.write("project", '{"webSerch":true}');
  const extension = harness();

  // Act
  await extension.emit("session_start");
  const payload = await extension.emit("before_provider_request", { payload: { model: model.id, input: [] } });

  // Assert
  expect(extension.notify.mock.calls).toEqual([
    ['pi-openai: global configuration: Unknown configuration entries: "verbosty".', "warning"],
    ['pi-openai: project configuration: Unknown configuration entries: "webSerch".', "warning"],
  ]);
  expect(payload).toHaveProperty("text.verbosity", "high");
});

it.each(["global", "project", "environment", "command"] as const)(
  "normalizes legacy priority from %s in status, saved configuration and requests",
  async (source) => {
    // Arrange
    if (source === "global" || source === "project") {
      await workspace.write(source, '{"serviceTier":"priority"}');
    } else if (source === "environment") {
      vi.stubEnv("PI_OPENAI_SERVICE_TIER", "priority");
    }
    const extension = harness();
    await extension.emit("session_start");

    // Act
    if (source === "command") {
      await extension.command("serviceTier priority");
    }
    await extension.command("status");
    await extension.command("save project");
    const payload = await extension.emit("before_provider_request", { payload: { model: model.id, input: [] } });

    // Assert
    expect(extension.appendEntry).toHaveBeenCalledWith(
      "pi-openai-status",
      expect.stringContaining(`| serviceTier | \`fast\` | ${source} | Set service_tier to fast (Fast mode) |`),
    );
    expect(parseConfig(await workspace.read("project"))).toHaveProperty("serviceTier", "fast");
    expect(payload).toHaveProperty("service_tier", "fast");
  },
);
