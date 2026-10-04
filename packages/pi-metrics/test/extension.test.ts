import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
  type ExtensionUIContext,
  type MessageEndEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadConfig } from "#src/config";
import metrics from "#src/index";

let root: string;
let cwd: string;
let agentDir: string;
let now: number;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-metrics-"));
  cwd = join(root, "project");
  agentDir = join(root, "agent");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(agentDir);
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

async function configure(config: Record<string, unknown>): Promise<void> {
  await writeFile(join(cwd, ".pi", "pi-metrics.jsonc"), JSON.stringify(config));
}

type AssistantMessage = Extract<MessageEndEvent["message"], { role: "assistant" }>;

function assistant(input = 100, output = 20): { type: "message_end"; message: AssistantMessage } {
  return {
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Done" }],
      api: "openai-completions",
      provider: "test",
      model: "test",
      stopReason: "stop",
      timestamp: 0,
      usage: {
        input,
        output,
        cacheRead: 500,
        cacheWrite: 50,
        totalTokens: input + output + 550,
        cost: { input: 0.001, output: 0.002, cacheRead: 0.003, cacheWrite: 0.004, total: 0.01 },
      },
    },
  };
}

type WidgetFactory = Exclude<Parameters<ExtensionUIContext["setWidget"]>[1], undefined>;

function renderWidget(factory: WidgetFactory | undefined, width = 80): string[] {
  if (!factory) {
    throw new Error("Missing metrics widget");
  }
  const component = factory({} as Parameters<WidgetFactory>[0], {} as Parameters<WidgetFactory>[1]);
  return component.render(width);
}

function harness(hasUI = true) {
  type Handler = (event: never, ctx: ExtensionContext) => unknown;
  const handlers = new Map<string, Set<Handler>>();
  const notify = vi.fn();
  const setWidget = vi.fn<ExtensionUIContext["setWidget"]>();
  const ctx = { cwd, hasUI, ui: { notify, setWidget } } as unknown as ExtensionContext;
  const api = {
    on(name: string, handler: Handler) {
      let entries = handlers.get(name);
      if (!entries) {
        entries = new Set();
        handlers.set(name, entries);
      }
      entries.add(handler);
      return () => {
        entries.delete(handler);
        if (entries.size === 0) {
          handlers.delete(name);
        }
      };
    },
  } as unknown as ExtensionAPI;
  metrics(api);
  return {
    handlers,
    notify,
    setWidget,
    async emit(name: string, event: unknown = { type: name }) {
      for (const handler of handlers.get(name) ?? []) {
        await handler(event as never, ctx);
      }
    },
    async respond(input = 100, output = 20) {
      await this.emit("turn_start");
      now += 1000;
      await this.emit("message_end", assistant(input, output));
    },
  };
}

it("provides all defaults without a config file", async () => {
  // Act
  const config = await loadConfig(cwd, { agentDir });

  // Assert
  expect(config).toEqual({
    enabled: true,
    mode: "notify",
    format: "<timetaken> | <tokps> | \u2191 <input_tokens> \u2193 <output_tokens> | <cost>",
  });
});

it("accepts global JSONC and lets project configuration replace it", async () => {
  // Arrange
  await writeFile(join(agentDir, "pi-metrics.jsonc"), '{ // live metrics\n "mode": "live", "format": "<cost>", }');

  // Act
  const global = await loadConfig(cwd, { agentDir });
  await configure({ enabled: false });
  const project = await loadConfig(cwd, { agentDir });

  // Assert
  expect(global).toEqual({ enabled: true, mode: "live", format: "<cost>" });
  expect(project).toMatchObject({ enabled: false, mode: "notify" });
  expect(project.format).toContain("<tokps>");
});

it.each([
  [{ enabled: "false" }, "enabled must be a boolean"],
  [{ mode: "other" }, 'mode must be "notify" or "live"'],
  [{ mode: null }, 'mode must be "notify" or "live"'],
  [{ format: 1 }, "format must be a string"],
  [{ format: null }, "format must be a string"],
])("rejects invalid configuration %j", async (config, reason) => {
  // Arrange
  await configure(config);

  // Act / Assert
  await expect(loadConfig(cwd, { agentDir })).rejects.toThrow(reason);
});

it("notifies only when control returns to the user, with uncached tokens and full cost", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await extension.emit("agent_start");

  // Act
  await extension.respond();
  now += 5000;
  await extension.emit("tool_execution_end");
  await extension.emit("turn_end");
  await extension.respond(200, 40);
  await extension.emit("agent_end");

  // Assert
  expect(extension.notify).not.toHaveBeenCalled();
  await extension.emit("agent_settled");
  await extension.emit("agent_settled");
  expect(extension.notify.mock.calls).toEqual([["7s | 30.0 tok/s | \u2191 300 \u2193 60 | $0.0200", "info"]]);
  expect(extension.setWidget).not.toHaveBeenCalled();
});

it("starts fresh after settling without counting idle time or other message roles", async () => {
  // Arrange
  await configure({ format: "<input_tokens>/<output_tokens> <timetaken>" });
  const extension = harness();
  await extension.emit("session_start");
  await extension.emit("agent_start");
  await extension.respond(1000, 500);
  await extension.emit("agent_settled");
  now += 60000;

  // Act
  await extension.emit("message_end", assistant(900, 900));
  await extension.emit("agent_start");
  await extension.emit("message_end", { message: { role: "user" } });
  await extension.emit("message_end", { message: { role: "toolResult" } });
  await extension.respond(10, 5);
  await extension.emit("agent_settled");

  // Assert
  expect(extension.notify).toHaveBeenLastCalledWith("10/5 1s", "info");
});

it("updates one live widget after model responses and tools, then retains final values", async () => {
  // Arrange
  await configure({ mode: "live", format: "<input_tokens> <timetaken>" });
  const extension = harness();
  const timer = vi.spyOn(globalThis, "setInterval");
  await extension.emit("session_start");

  // Act
  await extension.emit("agent_start");
  await extension.respond();
  now += 2000;
  await extension.emit("tool_execution_end");
  now += 1000;
  await extension.emit("tool_execution_end", { parentToolCallId: "outer" });
  await extension.respond(200);
  await extension.emit("agent_settled");

  // Assert
  expect(
    extension.setWidget.mock.calls.map(([key, content, options]) => [key, renderWidget(content), options]),
  ).toEqual(
    ["0 0s", "100 1s", "100 3s", "100 4s", "300 5s", "300 5s"].map((text) => [
      "pi-metrics",
      [text.padStart(80)],
      { placement: "aboveEditor" },
    ]),
  );
  expect(extension.notify).not.toHaveBeenCalled();
  expect(timer).not.toHaveBeenCalled();
  now += 60000;
  await extension.emit("tool_execution_end");
  expect(extension.setWidget).toHaveBeenCalledTimes(6);
  expect(renderWidget(extension.setWidget.mock.lastCall?.[1], 40)).toEqual(["300 5s".padStart(40)]);
  await extension.emit("agent_start");
  expect(renderWidget(extension.setWidget.mock.lastCall?.[1])).toEqual(["0 0s".padStart(80)]);
});

it.each([false, true])("registers no metric handlers when disabled (hasUI=%s)", async (hasUI) => {
  // Arrange
  await configure({ enabled: false, mode: "live" });
  const extension = harness(hasUI);

  // Act
  await extension.emit("session_start");
  await extension.emit("agent_start");
  await extension.respond();
  await extension.emit("tool_execution_end");
  await extension.emit("agent_settled");

  // Assert
  expect([...extension.handlers.keys()]).toEqual(["session_start"]);
  expect(performance.now).not.toHaveBeenCalled();
  expect(extension.notify).not.toHaveBeenCalled();
  expect(extension.setWidget).not.toHaveBeenCalled();
});

it("does not track metrics without a UI", async () => {
  // Arrange
  const extension = harness(false);

  // Act
  await extension.emit("session_start");

  // Assert
  expect([...extension.handlers.keys()]).toEqual(["session_start"]);
  expect(performance.now).not.toHaveBeenCalled();
});

it.each([
  ["literal", false, false],
  ["<timetaken>", false, false],
  ["<cost>", true, false],
  ["<input_tokens>", true, false],
  ["<tokps>", true, true],
])("registers only the required metric events for %s", async (format, usage, timing) => {
  // Arrange
  await configure({ format });
  const extension = harness();

  // Act
  await extension.emit("session_start");

  // Assert
  expect(extension.handlers.has("message_end")).toBe(usage);
  expect(extension.handlers.has("turn_start")).toBe(timing);
  expect(extension.handlers.has("tool_execution_end")).toBe(false);
});

it("removes old handlers and widgets before reloading disabled configuration", async () => {
  // Arrange
  await configure({ mode: "live" });
  const extension = harness();
  await extension.emit("session_start");
  await extension.emit("agent_start");
  await extension.respond();
  await configure({ enabled: false });
  vi.mocked(performance.now).mockClear();

  // Act
  await extension.emit("session_start");
  await extension.emit("agent_settled");
  await extension.emit("agent_start");

  // Assert
  expect(extension.setWidget).toHaveBeenLastCalledWith("pi-metrics", undefined);
  expect(extension.notify).not.toHaveBeenCalled();
  expect([...extension.handlers.keys()]).toEqual(["session_start"]);
  expect(performance.now).not.toHaveBeenCalled();
});

it("reloads configuration without duplicating subscriptions", async () => {
  // Arrange
  const extension = harness();
  await extension.emit("session_start");
  await configure({ format: "<output_tokens>" });

  // Act
  await extension.emit("session_start");
  await extension.emit("agent_start");
  await extension.respond();
  await extension.emit("agent_settled");

  // Assert
  expect(extension.notify.mock.calls).toEqual([["20", "info"]]);
});

it("clears the live widget on shutdown", async () => {
  // Arrange
  await configure({ mode: "live" });
  const extension = harness();
  await extension.emit("session_start");
  await extension.emit("agent_start");

  // Act
  await extension.emit("session_shutdown");

  // Assert
  expect(extension.setWidget).toHaveBeenLastCalledWith("pi-metrics", undefined);
});

it("stays inactive when configuration loading fails", async () => {
  // Arrange
  await configure({ enabled: "yes" });
  const extension = harness();

  // Act / Assert
  await expect(extension.emit("session_start")).rejects.toThrow("enabled must be a boolean");
  expect([...extension.handlers.keys()]).toEqual(["session_start"]);
});

it.each(["notify", "live"])(
  "runs a tool-using turn through Pi's real loader and lifecycle in %s mode",
  async (mode) => {
    // Arrange
    await configure({ mode });
    const notify = vi.fn();
    const setWidget = vi.fn<ExtensionUIContext["setWidget"]>();
    const errors = vi.fn();
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false },
    });
    const model = {
      id: "metrics-test",
      name: "Metrics test",
      api: "openai-completions" as const,
      provider: "metrics-test",
      baseUrl: "https://example.invalid",
      reasoning: false,
      input: ["text" as const],
      cost: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
      contextWindow: 100000,
      maxTokens: 1000,
    };
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      noSkills: true,
      noThemes: true,
      noPromptTemplates: true,
      noContextFiles: true,
      additionalExtensionPaths: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
      extensionFactories: [
        (pi) =>
          pi.registerProvider(model.provider, {
            api: model.api,
            baseUrl: model.baseUrl,
            apiKey: "test-only",
            models: [model],
          }),
      ],
    });
    await loader.reload();
    const executed = vi.fn(async () => {
      expect(notify).not.toHaveBeenCalled();
      now += 5000;
      return { content: [{ type: "text" as const, text: "Tool finished" }], details: {} };
    });
    const { session, extensionsResult } = await createAgentSession({
      cwd,
      agentDir,
      model,
      resourceLoader: loader,
      settingsManager,
      sessionManager: SessionManager.inMemory(cwd),
      tools: ["metrics_tool"],
      customTools: [
        {
          name: "metrics_tool",
          label: "Metrics tool",
          description: "Test tool",
          parameters: { type: "object", properties: {} },
          execute: executed,
        },
      ],
    });
    let requests = 0;
    session.agent.streamFunction = () => {
      requests++;
      now += 1000;
      const message = assistant().message;
      if (requests === 1) {
        message.stopReason = "toolUse";
        message.content = [{ type: "toolCall", id: "call-1", name: "metrics_tool", arguments: {} }];
      }
      return {
        async *[Symbol.asyncIterator]() {
          yield { type: "done", reason: message.stopReason, message };
        },
        result: async () => message,
      } as unknown as Awaited<ReturnType<typeof session.agent.streamFunction>>;
    };

    try {
      await session.bindExtensions({
        uiContext: { notify, setWidget } as unknown as ExtensionUIContext,
        onError: errors,
      });

      // Act
      await session.prompt("Run the test tool and finish.");

      // Assert
      const expected = "7s | 20.0 tok/s | \u2191 200 \u2193 40 | $0.0200";
      expect(extensionsResult.errors).toEqual([]);
      expect(errors).not.toHaveBeenCalled();
      expect(executed).toHaveBeenCalledOnce();
      expect(requests).toBe(2);
      if (mode === "notify") {
        expect(notify.mock.calls).toEqual([[expected, "info"]]);
        expect(setWidget).not.toHaveBeenCalled();
      } else {
        expect(notify).not.toHaveBeenCalled();
        expect(setWidget).toHaveBeenLastCalledWith("pi-metrics", expect.any(Function), { placement: "aboveEditor" });
        expect(renderWidget(setWidget.mock.lastCall?.[1])).toEqual([expected.padStart(80)]);
        expect(setWidget).toHaveBeenCalledTimes(5);
      }
    } finally {
      session.dispose();
    }
  },
);

it.each([true, false])("warns about unknown entries even when enabled is %s", async (enabled) => {
  // Arrange
  await configure({ enabled, mod: "live" });
  const extension = harness();

  // Act
  await extension.emit("session_start");

  // Assert
  expect(extension.notify.mock.calls).toEqual([
    [`pi-metrics: ${join(cwd, ".pi", "pi-metrics.jsonc")}: Unknown configuration entries: "mod".`, "warning"],
  ]);
  await expect(loadConfig(cwd, { agentDir })).resolves.toMatchObject({ enabled, mode: "notify" });
});
