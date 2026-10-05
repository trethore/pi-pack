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
import * as files from "@pi-pack/shared/files";
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
  const isProjectTrusted = vi.fn(() => true);
  const ctx = {
    isProjectTrusted,
    cwd: workspace.cwd,
    mode,
    hasUI: mode === "tui",
    ui: { notify },
    model,
    thinkingLevel: "high",
  } as unknown as ExtensionCommandContext;
  openai(api);
  return {
    isProjectTrusted,
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
])("reports %s scope without changing config files", async (command, confirmation) => {
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
    expect.stringContaining(`pi-openai: ${confirmation} Scope: All models.`),
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
it.each(saveCases)("%s with existing %s saves only pending edits to %s", async (command, existing, destination) => {
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
    reasoningSummary: null,
    webSearch: true,
  });
  expect(saved).not.toHaveProperty("verbosity");
  expect(saved).not.toHaveProperty("enabled");
  expect(saved).not.toHaveProperty("serviceTier");
  expect(extension.notify).toHaveBeenLastCalledWith(
    expect.stringContaining(`Saved to ${destination} (All models: webSearch, reasoningSummary)`),
    "info",
  );
  expect(extension.notify.mock.calls.flat().join("\n")).not.toContain(workspace.root);
});

it("shows saved receipts without updating the active loaded layer", async () => {
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
    expect.stringContaining("| verbosity | `null` | default |"),
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
  { provider: "openai", apiKey: "sk-proj-test", tier: "priority" },
  { provider: "openai", apiKey: "sk-proj-test", tier: "fast" },
  { provider: "openai", apiKey: "chatgpt-access-token", tier: "priority" },
  { provider: "openai", apiKey: "chatgpt-access-token", tier: "fast" },
  { provider: "openai", apiKey: "sk-proj-test", tier: "ultrafast", id: "gpt-6-astra" },
  { provider: "openai", apiKey: "chatgpt-access-token", tier: "ultrafast", id: "gpt-6-astra" },
  { provider: "azure", apiKey: "azure-test", tier: "priority" },
  { provider: "azure", apiKey: "azure-test", tier: "fast" },
])(
  "modifies real Pi $provider requests using $apiKey and $tier without restoring auth-rejected fields",
  async ({ provider, apiKey, tier, id = model.id }) => {
    // Arrange
    vi.stubEnv("PI_OPENAI_VERBOSITY", "low");
    vi.stubEnv("PI_OPENAI_REASONING_SUMMARY", "none");
    vi.stubEnv("PI_OPENAI_WEB_SEARCH", "true");
    vi.stubEnv("PI_OPENAI_SERVICE_TIER", tier);
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT_NAME_MAP", `${id}=production-assistant`);
    const extension = harness("print");
    await extension.emit("session_start");
    const runtime = await ModelRuntime.create({
      authPath: workspace.agentDir + "/auth.json",
      modelsPath: null,
      modelsStorePath: workspace.agentDir + "/models-cache.json",
      refreshOnCreate: false,
    });
    const builtInModel = runtime.getModel("openai", id);
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
      model: provider === "openai" ? id : "production-assistant",
      text: { verbosity: "low" },
      reasoning: { effort: "high" },
    });
    expect(sent).not.toHaveProperty("reasoning.summary");
    expect(sent).toMatchObject({ service_tier: tier === "fast" ? "priority" : tier, tools: [{ type: "web_search" }] });
    if (provider === "azure" || apiKey.startsWith("sk-")) {
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

it.each(
  (["global", "project", "environment", "command"] as const).flatMap((source) =>
    ["priority", "fast", "ultrafast"].map((tier) => ({ source, tier })),
  ),
)("normalizes $tier from $source in status, saved configuration and requests", async ({ source, tier }) => {
  // Arrange
  if (source === "global" || source === "project") {
    await workspace.write(source, JSON.stringify({ serviceTier: tier }));
  } else if (source === "environment") {
    vi.stubEnv("PI_OPENAI_SERVICE_TIER", tier);
  }
  const expectedTier = tier === "fast" ? "priority" : tier;
  const extension = harness();
  extension.ctx.model = { ...extension.ctx.model, id: "gpt-6-astra" } as ExtensionContext["model"];
  await extension.emit("session_start");

  // Act
  if (source === "command") {
    await extension.command(`serviceTier ${tier}`);
  }
  await extension.command("status");
  await extension.command(`serviceTier ${tier}`);
  await extension.command("save project");
  const payload = await extension.emit("before_provider_request", { payload: { model: "gpt-6-astra", input: [] } });

  // Assert
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining(`| serviceTier | \`${expectedTier}\` | ${source} | Set service_tier to ${expectedTier} |`),
  );
  expect(parseConfig(await workspace.read("project"))).toHaveProperty("serviceTier", expectedTier);
  expect(payload).toHaveProperty("service_tier", expectedTier);
});

it.each(['{"verbosity":"low","unknown":true}', "{invalid"])(
  "ignores untrusted project configuration %s while retaining global and runtime overrides",
  async (source) => {
    // Arrange
    await workspace.write("global", '{"verbosity":"high","webSearch":true}');
    await workspace.write("project", source);
    vi.stubEnv("PI_OPENAI_REASONING_SUMMARY", "detailed");
    const extension = harness();
    extension.isProjectTrusted.mockReturnValue(false);
    const event = { payload: { model: model.id, input: [] } };

    // Act
    await extension.emit("session_start");
    const initial = await extension.emit("before_provider_request", event);
    await extension.command("verbosity medium");
    const overridden = await extension.emit("before_provider_request", event);
    await extension.command("reset");

    // Assert
    expect(initial).toMatchObject({
      text: { verbosity: "high" },
      reasoning: { summary: "detailed" },
      tools: [{ type: "web_search" }],
    });
    expect(overridden).toHaveProperty("text.verbosity", "medium");
    expect(await extension.emit("before_provider_request", event)).toEqual(initial);
    expect(extension.notify.mock.calls.every(([, level]) => level === "info")).toBe(true);
  },
);

it.each(["save", "save global"])("%s uses global configuration and status when untrusted", async (command) => {
  // Arrange
  await workspace.write("project", "{invalid");
  const extension = harness();
  extension.isProjectTrusted.mockReturnValue(false);
  await extension.emit("session_start");
  await extension.command("verbosity high");

  // Act
  await extension.command(command);
  await extension.command("reset");
  await extension.command("status");

  // Assert
  expect(parseConfig(await workspace.read("global"))).toHaveProperty("verbosity", "high");
  expect(await workspace.read("project")).toBe("{invalid");
  expect(extension.notify).toHaveBeenCalledWith(expect.stringContaining("Saved to global"), "info");
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("Save destination: **global**"),
  );
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("| verbosity | `null` | default |"),
  );
});

it.each([undefined, '{"verbosity":"low"}'])(
  "rejects save project when untrusted with project file %s",
  async (source) => {
    // Arrange
    if (source !== undefined) {
      await workspace.write("project", source);
    }
    const extension = harness();
    extension.isProjectTrusted.mockReturnValue(false);
    await extension.emit("session_start");
    await extension.command("verbosity high");

    // Act
    await extension.command("save project");
    await extension.command("status");

    // Assert
    expect(extension.notify).toHaveBeenLastCalledWith(
      "pi-openai: Project is not trusted; refusing to save project configuration.",
      "error",
    );
    expect(extension.appendEntry).toHaveBeenCalledWith(
      "pi-openai-status",
      expect.stringContaining("| verbosity | `high` | command |"),
    );
    if (source === undefined) {
      await expect(workspace.read("project")).rejects.toHaveProperty("code", "ENOENT");
    } else {
      expect(await workspace.read("project")).toBe(source);
    }
    await expect(workspace.read("global")).rejects.toHaveProperty("code", "ENOENT");
  },
);

it("drops the project layer when reloading untrusted and restores it when trusted again", async () => {
  // Arrange
  await workspace.write("global", '{"verbosity":"high"}');
  await workspace.write("project", '{"verbosity":"low"}');
  const extension = harness();
  const event = { payload: { model: model.id, input: [] } };
  await extension.emit("session_start");
  expect(await extension.emit("before_provider_request", event)).toHaveProperty("text.verbosity", "low");

  // Act
  extension.isProjectTrusted.mockReturnValue(false);
  await extension.emit("session_start");
  const untrusted = await extension.emit("before_provider_request", event);
  extension.isProjectTrusted.mockReturnValue(true);
  await extension.emit("session_start");
  const trusted = await extension.emit("before_provider_request", event);

  // Assert
  expect(untrusted).toHaveProperty("text.verbosity", "high");
  expect(trusted).toHaveProperty("text.verbosity", "low");
});

it("uses the closest scope for every setting and preserves command targets across model switches", async () => {
  // Arrange
  await workspace.write(
    "project",
    JSON.stringify({
      overrides: [
        { match: { provider: "openai" }, settings: { webSearch: true } },
        { match: { model: model.id }, settings: { verbosity: "high" } },
        { match: { api: model.api }, settings: { reasoningSummary: "auto" } },
      ],
    }),
  );
  const extension = harness();
  await extension.emit("session_start");

  // Act
  await extension.command("serviceTier priority");
  await extension.command("status");
  extension.ctx.model = { ...model, id: "gpt-6.1-sol" } as ExtensionContext["model"];
  await extension.command("verbosity low");
  await extension.command("save");

  // Assert
  expect(extension.notify).toHaveBeenCalledWith(expect.stringContaining(`Scope: model=${model.id}`), "info");
  expect(extension.notify).toHaveBeenCalledWith(expect.stringContaining("Scope: provider=openai"), "info");
  expect(parseConfig(await workspace.read("project"))).toEqual({
    overrides: [
      { match: { provider: "openai" }, settings: { webSearch: true, verbosity: "low" } },
      { match: { model: model.id }, settings: { verbosity: "high", serviceTier: "priority" } },
      { match: { api: model.api }, settings: { reasoningSummary: "auto" } },
    ],
  });
  const current = await extension.emit("before_provider_request", { payload: { model: "gpt-6.1-sol", input: [] } });
  expect(current).toHaveProperty("text.verbosity", "low");
  expect(current).not.toHaveProperty("service_tier");
});

it("isolates explicit provider+model commands and reports broader edits that are masked", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");

  // Act
  await extension.command("verbosity low --scope provider+model");
  await extension.command("verbosity high --scope provider");

  // Assert
  expect(extension.notify).toHaveBeenLastCalledWith(
    expect.stringContaining("Masked by provider=openai, model=gpt-6-sol; effective value = low"),
    "info",
  );
  expect(await extension.emit("before_provider_request", { payload: { model: model.id, input: [] } })).toHaveProperty(
    "text.verbosity",
    "low",
  );
  extension.ctx.model = { ...model, id: "gpt-6.1-sol" } as ExtensionContext["model"];
  expect(
    await extension.emit("before_provider_request", { payload: { model: "gpt-6.1-sol", input: [] } }),
  ).toHaveProperty("text.verbosity", "high");
  extension.ctx.model = {
    ...model,
    provider: "azure",
    api: "azure-openai-responses",
    baseUrl: "https://example.openai.azure.com",
  } as ExtensionContext["model"];
  expect(await extension.emit("before_provider_request", { payload: { model: model.id, input: [] } })).toBeUndefined();
});

it("retargets saves on disk only, including after switching to another model", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity low --scope model");

  // Act
  await extension.command("save global --scope provider");
  await extension.command("status");
  extension.ctx.model = { ...model, id: "gpt-6.1-sol" } as ExtensionContext["model"];
  const beforeReload = await extension.emit("before_provider_request", {
    payload: { model: "gpt-6.1-sol", input: [] },
  });
  await extension.command("status");
  await extension.emit("session_start");
  const afterReload = await extension.emit("before_provider_request", { payload: { model: "gpt-6.1-sol", input: [] } });

  // Assert
  expect(parseConfig(await workspace.read("global"))).toEqual({
    overrides: [{ match: { provider: "openai" }, settings: { verbosity: "low" } }],
  });
  expect(beforeReload).toBeUndefined();
  expect(afterReload).toHaveProperty("text.verbosity", "low");
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("Saved only; not loaded"),
  );
  expect(extension.appendEntry).toHaveBeenCalledWith(
    "pi-openai-status",
    expect.stringContaining("Default command target: `All models`"),
  );
  expect(extension.appendEntry).toHaveBeenCalledWith("pi-openai-status", expect.stringContaining("command, saved"));
});

it("reset after saving exposes session-loaded config until reload", async () => {
  // Arrange
  await workspace.write("global", '{"verbosity":"medium"}');
  const extension = harness();
  const event = { payload: { model: model.id, input: [] } };
  await extension.emit("session_start");
  await extension.command("verbosity low");

  // Act / Assert
  await extension.command("save");
  expect(await extension.emit("before_provider_request", event)).toHaveProperty("text.verbosity", "low");
  await extension.command("reset");
  expect(await extension.emit("before_provider_request", event)).toHaveProperty("text.verbosity", "medium");
  await extension.emit("session_start");
  expect(await extension.emit("before_provider_request", event)).toHaveProperty("text.verbosity", "low");
});

it("fails conflicting save retargets without losing pending edits or creating files", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity low --scope model");
  await extension.command("verbosity high --scope provider");

  // Act / Assert
  await extension.command("save --scope all");
  expect(extension.notify).toHaveBeenLastCalledWith(expect.stringContaining("Conflicting verbosity"), "error");
  await expect(workspace.read("global")).rejects.toHaveProperty("code", "ENOENT");
  await extension.command("status");
  expect(extension.appendEntry).toHaveBeenLastCalledWith(
    "pi-openai-status",
    expect.stringContaining("Pending save groups: 2"),
  );
  await extension.command("save");
  expect(parseConfig(await workspace.read("global"))).toEqual({
    overrides: [
      { match: { model: model.id }, settings: { verbosity: "low" } },
      { match: { provider: "openai" }, settings: { verbosity: "high" } },
    ],
  });
});

it("does not save environment settings or write again without new pending edits", async () => {
  // Arrange
  vi.stubEnv("PI_OPENAI_VERBOSITY", "high");
  const extension = harness();
  await extension.emit("session_start");

  // Act / Assert
  await extension.command("save project");
  expect(extension.notify).toHaveBeenLastCalledWith("pi-openai: No pending edits to save.", "info");
  await expect(workspace.read("project")).rejects.toHaveProperty("code", "ENOENT");
  await extension.command("webSearch true --scope api");
  await extension.command("save");
  const saved = await workspace.read("global");
  expect(parseConfig(saved)).toEqual({ overrides: [{ match: { api: model.api }, settings: { webSearch: true } }] });
  await extension.command("save project");
  expect(await workspace.read("global")).toBe(saved);
  await expect(workspace.read("project")).rejects.toHaveProperty("code", "ENOENT");
});

it("requires --scope all without a model but can save previously captured edits", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity low --scope model");
  extension.ctx.model = undefined;

  // Act / Assert
  await extension.command("verbosity high");
  expect(extension.notify).toHaveBeenLastCalledWith(expect.stringContaining("No model selected"), "error");
  await extension.command("reset");
  expect(extension.notify).toHaveBeenLastCalledWith(expect.stringContaining("No model selected"), "error");
  await extension.command("verbosity high --scope all");
  await extension.command("save");
  expect(parseConfig(await workspace.read("global"))).toEqual({
    verbosity: "high",
    overrides: [{ match: { model: model.id }, settings: { verbosity: "low" } }],
  });
  await extension.command("reset --all-scopes");
  await extension.command("status");
  expect(extension.appendEntry).toHaveBeenLastCalledWith(
    "pi-openai-status",
    expect.stringContaining("| verbosity | `null` | default |"),
  );
});

it("ignores untrusted scope candidates and displays only loaded scopes", async () => {
  // Arrange
  await workspace.write("global", JSON.stringify({ overrides: [{ match: { api: model.api }, settings: {} }] }));
  await workspace.write(
    "project",
    JSON.stringify({
      overrides: [{ match: { provider: "openai", model: model.id }, settings: { verbosity: "high" } }],
    }),
  );
  const extension = harness();
  extension.isProjectTrusted.mockReturnValue(false);
  await extension.emit("session_start");

  // Act
  await extension.command("verbosity low");
  await extension.command("status");

  // Assert
  expect(extension.notify).toHaveBeenLastCalledWith(expect.stringContaining(`Scope: api=${model.api}`), "info");
  expect(extension.appendEntry.mock.calls[0]?.[1]).not.toContain("provider=openai, model=gpt-6-sol");
});

it("selects a specific global scope without bypassing project precedence after reload", async () => {
  // Arrange
  await workspace.write(
    "global",
    JSON.stringify({
      overrides: [
        {
          match: { provider: "openai", model: model.id },
          settings: { verbosity: "medium" },
        },
      ],
    }),
  );
  await workspace.write("project", '{"verbosity":"high"}');
  const extension = harness();
  const event = { payload: { model: model.id, input: [] } };
  await extension.emit("session_start");

  // Act / Assert
  await extension.command("verbosity low");
  expect(extension.notify).toHaveBeenLastCalledWith(
    expect.stringContaining("Scope: provider=openai, model=gpt-6-sol"),
    "info",
  );
  await extension.command("save global");
  expect(await extension.emit("before_provider_request", event)).toHaveProperty("text.verbosity", "low");
  await extension.emit("session_start");
  expect(await extension.emit("before_provider_request", event)).toHaveProperty("text.verbosity", "high");
});

it("retains edits made during a save and rejects overlapping saves", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await extension.command("verbosity low");
  const { promise: gate, resolve: resume } = Promise.withResolvers<void>();
  const { promise: started, resolve: entered } = Promise.withResolvers<void>();
  const read = files.readOptionalFile;
  const spy = vi.spyOn(files, "readOptionalFile").mockImplementation(async (path) => {
    entered();
    await gate;
    return read(path);
  });

  // Act
  const saving = extension.command("save global");
  await started;
  try {
    await extension.command("verbosity high");
    await extension.command("save project");
  } finally {
    resume();
  }
  await saving;
  spy.mockRestore();

  // Assert
  expect(extension.notify).toHaveBeenCalledWith("pi-openai: A save is already in progress.", "error");
  expect(parseConfig(await workspace.read("global"))).toEqual({ verbosity: "low" });
  expect(await extension.emit("before_provider_request", { payload: { model: model.id, input: [] } })).toHaveProperty(
    "text.verbosity",
    "high",
  );
  await extension.command("status");
  expect(extension.appendEntry).toHaveBeenLastCalledWith(
    "pi-openai-status",
    expect.stringContaining("Pending save groups: 1"),
  );
  await extension.command("save global");
  expect(parseConfig(await workspace.read("global"))).toEqual({ verbosity: "high" });
});
