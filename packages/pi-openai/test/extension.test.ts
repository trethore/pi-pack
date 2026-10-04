import type { Provider } from "@earendil-works/pi-ai";
import type { Destination } from "#src/constants";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  DefaultResourceLoader,
  ModelRuntime,
  ModelRegistry,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type ProviderConfig,
} from "@earendil-works/pi-coding-agent";
import { parseConfig } from "@pi-pack/shared/config";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import openai from "#src/index";
import { environmentNames } from "#src/settings";
import { createWorkspace, model } from "#test/support";
import { codexModel, codexResponse, codexToken, mockWebSockets, subscriptionModel } from "#test/codex-support";

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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await workspace.dispose();
});

function harness(mode: ExtensionContext["mode"] = "tui", registry?: ModelRegistry) {
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
    registerProvider(provider: Provider | string, config?: ProviderConfig) {
      if (typeof provider === "string") {
        if (!config) {
          throw new Error("Missing provider configuration");
        }
        registry?.registerProvider(provider, config);
      } else {
        registry?.registerProvider(provider);
      }
    },
    unregisterProvider(name: string) {
      registry?.unregisterProvider(name);
    },
    appendEntry,
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: workspace.cwd,
    mode,
    hasUI: mode === "tui",
    ui: { notify },
    model,
    thinkingLevel: "high",
    modelRegistry: registry ?? { getProvider: () => undefined, find: () => undefined, isUsingOAuth: () => false },
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

function createRuntime() {
  return ModelRuntime.create({
    authPath: workspace.agentDir + "/auth.json",
    modelsPath: null,
    modelsStorePath: workspace.agentDir + "/models-cache.json",
    refreshOnCreate: false,
  });
}

async function loadExtension() {
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

  await loader.reload();
  return loader.getExtensions();
}

it("loads through Pi's TypeScript loader with all workspace dependencies", async () => {
  // Act
  const loaded = await loadExtension();

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
    vi.stubEnv("PI_OPENAI_CODEX_ORIGINATOR", "true");
    const runtime = await createRuntime();
    const extension = harness("print", new ModelRegistry(runtime));
    await extension.emit("session_start");
    const requestModel = runtime.getModel("openai", model.id);
    if (!requestModel) {
      throw new Error("Missing built-in OpenAI model");
    }
    let sent: unknown;
    let sentHeaders = new Headers();
    const fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      if (typeof init?.body !== "string") {
        throw new Error("Expected a JSON request body");
      }
      sent = JSON.parse(init.body) as unknown;
      sentHeaders = new Headers(init.headers);
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
    expect(sentHeaders.get("originator")).toBe(apiKey.startsWith("sk-") ? null : "codex-tui");
    expect(sentHeaders.get("x-codex-routing-hint")).toBe(
      apiKey.startsWith("sk-") ? null : `model=${model.id};tier=priority`,
    );
    await extension.emit("session_shutdown");
    if (apiKey.startsWith("sk-")) {
      expect(sent).toMatchObject({ max_output_tokens: 1024, temperature: 0.5 });
    } else {
      expect(sent).not.toHaveProperty("max_output_tokens");
      expect(sent).not.toHaveProperty("temperature");
    }
  },
);

it.each([
  { name: "legacy Codex WebSockets", requestModel: codexModel, transport: "websocket" as const },
  { name: "OpenAI subscription HTTP", requestModel: subscriptionModel, transport: "sse" as const },
])("applies loaded settings to $name and restores providers on reload failure", async ({ requestModel, transport }) => {
  // Arrange
  const providerId = requestModel.provider;
  const { Socket, sockets } = mockWebSockets();
  vi.stubGlobal("WebSocket", Socket);
  const loaded = await loadExtension();
  expect(loaded.errors).toEqual([]);
  const extension = loaded.extensions.find((entry) => entry.commands.has("pi-openai"))!;
  await writeFile(
    workspace.agentDir + "/auth.json",
    JSON.stringify({
      [providerId]: { type: "oauth", access: codexToken, refresh: "test", expires: Date.now() + 3600000 },
    }),
  );
  const runtime = await createRuntime();
  const originals = ["openai", "openai-codex"].map((id) => runtime.getProvider(id)!);
  const sentHeaders: Headers[] = [];
  const fetch = vi.fn((_input: unknown, init?: RequestInit) => {
    sentHeaders.push(new Headers(init?.headers));
    return Promise.resolve(codexResponse());
  });
  loaded.runtime.registerNativeProvider = (provider) => runtime.registerNativeProvider(provider);
  loaded.runtime.registerProvider = (name, config) => runtime.registerProvider(name, config);
  loaded.runtime.unregisterProvider = (name) => runtime.unregisterProvider(name);
  const ctx = {
    cwd: workspace.cwd,
    mode: "print",
    model: requestModel,
    modelRegistry: new ModelRegistry(runtime),
    ui: { notify: vi.fn() },
  } as unknown as ExtensionCommandContext;
  async function emit(name: string, event: unknown = {}): Promise<unknown> {
    let result: unknown;
    for (const handler of extension.handlers.get(name) ?? []) {
      result = await handler(event, ctx);
    }
    return result;
  }
  async function command(args: string): Promise<void> {
    await extension.commands.get("pi-openai")!.handler(args, ctx);
  }
  async function send(): Promise<void> {
    const result = await runtime
      .streamSimple(
        requestModel,
        { messages: [] },
        {
          sessionId: "loaded-extension-session",
          transport,
          fetch,
          onPayload: (payload) => emit("before_provider_request", { payload }),
        },
      )
      .result();
    expect(result.stopReason, result.errorMessage).not.toBe("error");
  }

  try {
    // Act
    await emit("session_start");
    await send();
    await command("serviceTier priority");
    await command("codexOriginator true");
    await send();
    await command("save project");
    expect(parseConfig(await workspace.read("project"))).toMatchObject({
      codexOriginator: true,
      serviceTier: "priority",
    });
    await emit("session_start");
    await send();
    await command("enabled false");
    await send();
    await workspace.write("project", '{"codexOriginator":null}');
    await expect(emit("session_start")).rejects.toThrow("Invalid project configuration");

    // Assert
    for (const original of originals) {
      expect(runtime.getProvider(original.id)).toBe(original);
    }
    const legacy = transport === "websocket";
    expect(sockets).toHaveLength(legacy ? 4 : 0);
    expect(fetch).toHaveBeenCalledTimes(legacy ? 0 : 4);
    const headers = legacy ? sockets.map((socket) => socket.headers) : sentHeaders;
    const initialOriginator = legacy ? "pi" : null;
    expect(headers.map((entry) => entry.get("originator"))).toEqual([
      initialOriginator,
      "codex-tui",
      "codex-tui",
      initialOriginator,
    ]);
    expect(headers.map((entry) => entry.get("x-codex-routing-hint"))).toEqual([
      null,
      `model=${requestModel.id};tier=priority`,
      `model=${requestModel.id};tier=priority`,
      null,
    ]);
  } finally {
    await emit("session_shutdown");
    for (const socket of sockets) {
      socket.close();
    }
  }
});

it.each(
  ["openai", "openai-codex"].flatMap((providerId) =>
    ["builtin", "native", "config"].map((kind) => ({ providerId, kind })),
  ),
)("restores the previous $providerId $kind registration on shutdown", async ({ providerId, kind }) => {
  // Arrange
  const runtime = await createRuntime();
  const registry = new ModelRegistry(runtime);
  const original = registry.getProvider(providerId)!;
  if (kind === "native") {
    registry.registerProvider({ ...original, name: "Other extension" });
  } else if (kind === "config") {
    registry.registerProvider(providerId, { headers: { "x-other-extension": "keep" } });
  }
  const native = registry.getRegisteredNativeProvider(providerId);
  const config = registry.getRegisteredProviderConfig(providerId);
  const extension = harness("print", registry);

  // Act
  await extension.emit("session_start");
  await extension.emit("session_start");
  await extension.emit("session_shutdown");

  // Assert
  expect(registry.getRegisteredNativeProvider(providerId)).toBe(native);
  expect(registry.getRegisteredProviderConfig(providerId)).toEqual(config);
  if (kind === "builtin") {
    expect(registry.getProvider(providerId)).toBe(original);
  }
});

it.each(["openai", "openai-codex"])("does not undo another extension's replacement of %s", async (providerId) => {
  // Arrange
  const runtime = await createRuntime();
  const registry = new ModelRegistry(runtime);
  const replacement = { ...registry.getProvider(providerId)!, name: "New owner" };
  const extension = harness("print", registry);
  await extension.emit("session_start");
  registry.registerProvider(replacement);

  // Act
  await extension.emit("session_shutdown");

  // Assert
  expect(registry.getRegisteredNativeProvider(providerId)).toBe(replacement);
});

it.each(["api_key", "oauth"])("reports the selected OpenAI account's %s status", async (type) => {
  // Arrange
  await workspace.write("project", '{"codexOriginator":true,"serviceTier":"priority"}');
  const credentials =
    type === "oauth"
      ? { type, access: "chatgpt-access-token", refresh: "test", expires: Date.now() + 3600000 }
      : { type, key: "sk-proj-test" };
  await writeFile(workspace.agentDir + "/auth.json", JSON.stringify({ openai: credentials }));
  const runtime = await createRuntime();
  const extension = harness("print", new ModelRegistry(runtime));
  await extension.emit("session_start");

  // Act
  await runtime.refresh({ allowNetwork: false, providers: ["openai"] });
  await extension.command("status");

  // Assert
  expect(extension.notify).toHaveBeenCalledWith(
    expect.stringContaining(
      type === "oauth"
        ? "subscription headers; server support unverified"
        : "Skipped: Requires OpenAI ChatGPT subscription authentication",
    ),
    "info",
  );
  await extension.emit("session_shutdown");
});

it("rolls back the first provider if wrapping the second provider fails", async () => {
  // Arrange
  const runtime = await createRuntime();
  const registry = new ModelRegistry(runtime);
  const original = registry.getProvider("openai")!;
  vi.spyOn(registry, "getProvider")
    .mockReturnValueOnce(original)
    .mockImplementationOnce(() => {
      throw new Error("Provider unavailable");
    });
  const extension = harness("print", registry);

  // Act / Assert
  await expect(extension.emit("session_start")).rejects.toThrow("pi-openai: Provider unavailable");
  expect(registry.getRegisteredNativeProvider("openai")).toBeUndefined();
  expect(runtime.getProvider("openai")).toBe(original);
  await extension.emit("session_shutdown");
});

it("attempts to restore both providers even if one restoration fails", async () => {
  // Arrange
  const runtime = await createRuntime();
  const registry = new ModelRegistry(runtime);
  const original = registry.getProvider("openai");
  const extension = harness("print", registry);
  await extension.emit("session_start");
  const unregister = registry.unregisterProvider.bind(registry);
  const restore = vi.spyOn(registry, "unregisterProvider").mockImplementation((id) => {
    if (id === "openai-codex") {
      throw new Error("Restoration blocked");
    }
    unregister(id);
  });

  // Act / Assert
  try {
    await expect(extension.emit("session_shutdown")).rejects.toThrow("Could not restore OpenAI providers.");
    expect(restore).toHaveBeenCalledWith("openai-codex");
    expect(restore).toHaveBeenCalledWith("openai");
    expect(runtime.getProvider("openai")).toBe(original);
  } finally {
    restore.mockRestore();
    unregister("openai-codex");
  }
});
