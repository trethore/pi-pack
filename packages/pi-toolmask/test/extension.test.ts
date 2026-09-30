import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionAPI,
  type ExtensionFactory,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import toolmask from "../src/index.ts";

let directory: string;
let sessions: AgentSession[];
let api: ExtensionAPI;
const executed = vi.fn(async () => ({ content: [{ type: "text" as const, text: "nested result" }], details: {} }));

function writeConfig(masks: string[], options: Record<string, boolean> = {}): void {
  writeFileSync(path.join(directory, ".pi", "pi-toolmask.jsonc"), JSON.stringify({ enabled: true, masks, ...options }));
}

const custom: ExtensionFactory = (pi) => {
  api = pi;
  pi.registerTool({
    name: "special",
    label: "Special",
    description: "Unique nested special tool",
    parameters: { type: "object", properties: {} },
    exposure: "codemode",
    execute: executed,
  });
  pi.registerTool({
    name: "deferred",
    label: "Deferred",
    description: "Unique deferred tool",
    parameters: { type: "object", properties: {} },
    exposure: "deferred",
    execute: executed,
  });
};

async function start(tools = ["read", "bash", "edit", "write"], mode: "on" | "only" = "on", loadFromFile = false) {
  const settingsManager = SettingsManager.inMemory({ codemode: { mode } });
  const loader = new DefaultResourceLoader({
    cwd: directory,
    agentDir: path.join(directory, "agent"),
    settingsManager,
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    additionalExtensionPaths: loadFromFile ? [fileURLToPath(new URL("../src/index.ts", import.meta.url))] : [],
    extensionFactories: [
      custom,
      ...(loadFromFile ? [] : [toolmask]),
      { name: "codemode", factory: createCodemodeExtension(), replaceable: true, builtin: true },
    ],
  });
  await loader.reload();
  const result = await createAgentSession({
    cwd: directory,
    agentDir: path.join(directory, "agent"),
    resourceLoader: loader,
    settingsManager,
    sessionManager: SessionManager.inMemory(directory),
  });
  result.session.setActiveToolsByName(tools);
  sessions.push(result.session);
  const errors = vi.fn();
  await result.session.bindExtensions({ onError: errors });
  expect(result.extensionsResult.errors).toEqual([]);
  expect(errors).not.toHaveBeenCalled();
  return { session: result.session, extensions: result.extensionsResult.extensions, errors };
}

async function runCode(session: AgentSession, code: string) {
  const tool = session.agent.state.tools.find((entry) => entry.name === "codemode");
  if (!tool) throw new Error("codemode is not active");
  session.agent.state.messages.push({
    role: "assistant",
    api: "openai-completions",
    provider: "test",
    model: "test",
    content: [{ type: "toolCall", id: "codemode-test", name: "codemode", arguments: { code } }],
    stopReason: "toolUse",
    timestamp: 0,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  });
  return tool.execute("codemode-test", { code }, new AbortController().signal);
}

function resultText(result: Awaited<ReturnType<typeof runCode>>): string {
  return result.content
    .filter((entry) => entry.type === "text")
    .map((entry) => entry.text)
    .join("\n");
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "pi-toolmask-extension-"));
  mkdirSync(path.join(directory, ".pi"));
  sessions = [];
  executed.mockClear();
});

afterEach(() => {
  for (const session of sessions) session.dispose();
  rmSync(directory, { recursive: true, force: true });
});

describe("Pi integration", () => {
  it("keeps only read without codemode", async () => {
    // Arrange
    writeConfig(["*", "!read"]);

    // Act
    const { session } = await start();

    // Assert
    expect(session.getActiveToolNames()).toEqual(["read"]);
  });

  it("does not activate an inactive exception or codemode itself", async () => {
    // Arrange
    writeConfig(["*", "!read", "!codemode", "!special"]);

    // Act
    const { session } = await start(["bash"]);

    // Assert
    expect(session.getActiveToolNames()).toEqual([]);
  });

  it("leaves Pi's active set unchanged when disabled", async () => {
    // Arrange
    writeConfig(["*"], { enabled: false });

    // Act
    const { session } = await start(["read", "codemode"]);

    // Assert
    expect(session.getActiveToolNames()).toEqual(["read", "codemode"]);
  });

  it.each(["on", "only"] as const)("hides masked nested tools in codemode %s mode", async (mode) => {
    // Arrange
    writeConfig(["codemode.read", "codemode.special", "codemode.deferred"]);
    const { session } = await start(["read", "codemode"], mode);

    // Act
    const description = session.agent.state.tools.find((tool) => tool.name === "codemode")?.description;
    const result = await runCode(session, "return ALL_TOOLS.map(tool => tool.name);");

    // Assert
    expect(session.getActiveToolNames()).toContain("read");
    expect(description).not.toContain("Unique nested special tool");
    expect(description).not.toContain("Unique deferred tool");
    expect(resultText(result)).toContain("[]");
    expect(executed).not.toHaveBeenCalled();
  });

  it("removes masked tools from discovery and rejects guessed calls", async () => {
    // Arrange
    writeConfig(["codemode.*"]);
    const { session } = await start(["read", "codemode"]);

    // Act
    const discovery = await runCode(
      session,
      'return [ALL_TOOLS, await searchTools("special"), await describeTool("special")];',
    );
    const guessedCall = await runCode(session, "return await tools.special({});");

    // Assert
    expect(resultText(discovery)).toContain("[[],[],null]");
    expect(guessedCall.isError).toBe(true);
    expect(executed).not.toHaveBeenCalled();
  });

  it("allows a nested tool while hiding its top-level declaration", async () => {
    // Arrange
    writeConfig(["read", "codemode.special", "codemode.deferred"]);
    writeFileSync(path.join(directory, "sample.txt"), "nested read works");
    const { session } = await start(["read", "codemode"], "only");

    // Act
    const result = await runCode(session, 'return await tools.read({ path: "sample.txt" });');
    const projected = await session.agent.transformContext?.(
      [
        {
          role: "system",
          content: "",
          timestamp: 0,
          toolsAdded: session
            .getAllTools()
            .filter((tool) => session.getActiveToolNames().includes(tool.name))
            .map(({ name, description, parameters }) => ({ name, description, parameters })),
        },
      ],
      new AbortController().signal,
    );

    // Assert
    expect(resultText(result)).toContain("nested read works");
    expect(projected?.[0]).toMatchObject({ toolsAdded: [expect.objectContaining({ name: "codemode" })] });
  });

  it("preserves a nested exception without activating an inactive direct tool", async () => {
    // Arrange
    writeConfig(["*", "!codemode", "!codemode.read", "!codemode.special"]);
    const { session } = await start(["codemode"]);

    // Act
    const result = await runCode(session, "return ALL_TOOLS.map(tool => tool.name);");

    // Assert
    expect(resultText(result)).toContain('["special"]');
    expect(session.getActiveToolNames()).toEqual(["codemode"]);
  });

  it.each([true, false])("optionally enforces before-agent-start: %s", async (enforceBeforeAgentStart) => {
    // Arrange
    writeConfig(["bash"], { enforceBeforeAgentStart });
    const { session, extensions } = await start();
    api.setActiveTools(["read", "bash"]);
    const extension = extensions.find(
      (entry) => entry.tools.has("codemode") && entry.handlers.has("before_agent_start"),
    );
    const handler = extension?.handlers.get("before_agent_start")?.[0];

    // Act
    await handler?.();

    // Assert
    expect(session.getActiveToolNames()).toEqual(enforceBeforeAgentStart ? ["read"] : ["read", "bash"]);
  });

  it("restores originally active nested tools when codemode is activated before re-enforcement", async () => {
    // Arrange
    writeConfig(["read", "codemode.special", "codemode.deferred"], { enforceBeforeAgentStart: true });
    writeFileSync(path.join(directory, "sample.txt"), "read after activation");
    const { session, extensions } = await start(["read"]);
    expect(session.getActiveToolNames()).toEqual([]);
    api.setActiveTools(["codemode"]);
    const handler = extensions
      .find((entry) => entry.handlers.has("before_agent_start"))
      ?.handlers.get("before_agent_start")?.[0];

    // Act
    await handler?.();
    const result = await runCode(session, 'return await tools.read({ path: "sample.txt" });');

    // Assert
    expect(resultText(result)).toContain("read after activation");
  });

  it("blocks masked top-level and nested calls before execution", async () => {
    // Arrange
    writeConfig(["read", "codemode.special"]);
    const { extensions } = await start(["read", "codemode"]);
    const handler = extensions.find((entry) => entry.handlers.has("tool_call"))?.handlers.get("tool_call")?.[0];

    // Act
    const top = await handler?.({ type: "tool_call", toolCallId: "top", toolName: "read", input: {} });
    await handler?.({ type: "tool_call", toolCallId: "parent", toolName: "codemode", input: {} });
    const nested = await handler?.({
      type: "tool_call",
      toolCallId: "parent/1",
      parentToolCallId: "parent",
      toolName: "special",
      input: {},
    });

    // Assert
    expect(top).toEqual({ block: true, reason: "pi-toolmask: read is disabled" });
    expect(nested).toEqual({ block: true, reason: "pi-toolmask: codemode.special is disabled" });
    expect(executed).not.toHaveBeenCalled();
  });

  it("uses the loaded configuration until reload and restores tools removed by its old masks", async () => {
    // Arrange
    writeConfig(["bash"], { enforceBeforeAgentStart: true });
    const { session, extensions, errors } = await start(["read", "bash"]);
    writeConfig([], { enabled: false });
    const handler = extensions
      .find((entry) => entry.handlers.has("before_agent_start"))
      ?.handlers.get("before_agent_start")?.[0];

    // Act
    await handler?.();
    expect(session.getActiveToolNames()).toEqual(["read"]);
    await session.reload();

    // Assert
    expect(session.getActiveToolNames()).toContain("bash");
    expect(errors).not.toHaveBeenCalled();
  });

  it("loads the package entry through Pi's TypeScript extension loader", async () => {
    // Arrange
    writeConfig(["*", "!codemode", "!codemode.special"]);

    // Act
    const { session } = await start(["read", "codemode"], "only", true);
    const result = await runCode(session, "return await tools.special({});");

    // Assert
    expect(session.getActiveToolNames()).toEqual(["codemode"]);
    expect(resultText(result)).toContain("nested result");
    expect(executed).toHaveBeenCalledOnce();
  });

  it("retains the built-in codemode schema and rendering hooks", async () => {
    // Arrange
    writeConfig([]);
    const { session } = await start(["codemode"]);

    // Act
    const definition: ToolDefinition | undefined = session.getToolDefinition("codemode");

    // Assert
    expect(definition?.parameters).toMatchObject({ properties: { code: { type: "string" } } });
    expect(definition?.constrainedSampling).toBeDefined();
    expect(definition?.renderCall).toBeTypeOf("function");
    expect(definition?.renderResult).toBeTypeOf("function");
  });
});
