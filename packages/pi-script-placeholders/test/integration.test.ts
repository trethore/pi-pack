import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Events } from "@pi-pack/shared/events";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionError,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it } from "vitest";
import { countingScript, useWorkspace } from "#test/workspace";

const files = useWorkspace();
const sessions: AgentSession[] = [];
const providerName = "script-placeholders-test";
const modelId = "test";

afterEach(() => {
  for (const session of sessions.splice(0)) {
    session.dispose();
  }
});

async function createSession(reason: SessionStartEvent["reason"] = "startup") {
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const modelRuntime = await ModelRuntime.create({
    authPath: join(files.agentDir, "auth.json"),
    modelsPath: join(files.agentDir, "models.json"),
  });
  modelRuntime.registerProvider(providerName, {
    baseUrl: "http://localhost.invalid",
    api: "openai-completions",
    apiKey: "test-key",
    models: [
      {
        id: modelId,
        name: "Test",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 100000,
        maxTokens: 100,
      },
    ],
  });
  const model = modelRuntime.getModel(providerName, modelId);
  if (!model) {
    throw new Error("Missing test model");
  }
  const resourceLoader = new DefaultResourceLoader({
    cwd: files.cwd,
    agentDir: files.agentDir,
    settingsManager,
    noSkills: true,
    noThemes: true,
    additionalExtensionPaths: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);
  const { session } = await createAgentSession({
    cwd: files.cwd,
    agentDir: files.agentDir,
    settingsManager,
    modelRuntime,
    model,
    resourceLoader,
    sessionManager: SessionManager.inMemory(files.cwd),
    sessionStartEvent: { type: Events.SessionStart, reason },
    noTools: "all",
  });
  sessions.push(session);
  const errors: ExtensionError[] = [];
  await session.bindExtensions({ onError: (error) => errors.push(error) });
  const systemPrompts: string[] = [];
  const systemTranscripts: string[] = [];
  session.agent.streamFunction = (_model, context) => {
    systemTranscripts.push(JSON.stringify(context.messages.filter((message) => message.role === "system")));
    systemPrompts.push(session.systemPrompt);
    throw new Error("Stop before making a network request");
  };
  return { session, errors, systemPrompts, systemTranscripts };
}

function userTexts(session: AgentSession): string[] {
  return session.messages
    .filter((message) => message.role === "user")
    .map((message) => {
      if (typeof message.content === "string") {
        return message.content;
      }
      return message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
    });
}

it("expands real Pi resources without rewriting files and refreshes through real /reload", async () => {
  // Arrange
  const systemFile = join(files.agentDir, "SYSTEM.md");
  const appendFile = join(files.cwd, ".pi", "APPEND_SYSTEM.md");
  await writeFile(systemFile, "Environment: {{platform}}");
  await writeFile(appendFile, "Append: {{platform}}");
  await writeFile(join(files.cwd, "AGENTS.md"), "Untouched: {{platform}}");
  await files.script("platform", countingScript("original"));
  await files.prompt("environment", "---\ndescription: Test\n---\nPrompt: {{platform}} $1");
  const { session, errors, systemPrompts, systemTranscripts } = await createSession();

  // Act
  await session.prompt('/environment "first argument"');
  const firstSystem = systemPrompts[0];
  await files.script("platform", countingScript("updated"));
  await session.prompt("/environment second");
  const secondSystem = systemPrompts[1];
  await session.reload();
  await session.prompt("/environment third");

  // Assert
  expect(errors).toEqual([]);
  expect(userTexts(session)).toEqual([
    "Prompt: original first argument",
    "Prompt: original second",
    "Prompt: updated third",
  ]);
  expect(firstSystem).toContain("Environment: original");
  expect(firstSystem).toContain("Append: original");
  expect(firstSystem).toContain("Untouched: {{platform}}");
  expect(secondSystem).toBe(firstSystem);
  expect(systemTranscripts[0]).toContain("Environment: original");
  expect(systemTranscripts[0]).toContain("Append: original");
  expect(systemTranscripts[0]).not.toContain("Environment: {{platform}}");
  expect(systemTranscripts[0]).not.toContain("Append: {{platform}}");
  expect(systemTranscripts[1]).toBe(systemTranscripts[0]);
  expect(systemPrompts[2]).toContain("Environment: updated");
  expect(systemPrompts[2]).toContain("Append: updated");
  expect(await files.runs()).toBe("xx");
  expect(await readFile(systemFile, "utf8")).toBe("Environment: {{platform}}");
  expect(await readFile(appendFile, "utf8")).toBe("Append: {{platform}}");
});

it("retains results when Pi creates another session runtime in the same workspace", async () => {
  // Arrange
  await writeFile(join(files.agentDir, "SYSTEM.md"), "Environment: {{platform}}");
  await files.script("platform", countingScript("original"));
  const first = await createSession();
  await first.session.prompt("first");
  await files.script("platform", countingScript("updated"));

  // Act
  const second = await createSession("new");
  await second.session.prompt("second");

  // Assert
  expect(first.errors).toEqual([]);
  expect(second.errors).toEqual([]);
  expect(second.systemPrompts[0]).toContain("Environment: original");
  expect(await files.runs()).toBe("x");
});

it("keeps rendered slash commands literal rather than expanding them a second time", async () => {
  // Arrange
  await files.script("platform", countingScript("/other"));
  await files.prompt("environment", "{{platform}} $1");
  await files.prompt("other", "Unexpected second expansion: $1");
  const { session, errors } = await createSession();

  // Act
  await session.prompt("/environment argument");

  // Assert
  expect(errors).toEqual([]);
  expect(userTexts(session)).toEqual(["\n/other argument"]);
  expect(await files.runs()).toBe("x");
});
