import { fileURLToPath } from "node:url";
import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type ExtensionFactory,
  type ExtensionUIContext,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

type StreamFunction = NonNullable<AgentSession["agent"]["streamFunction"]>;
type RequestContext = Parameters<StreamFunction>[1];
type StreamResult = Awaited<ReturnType<StreamFunction>>;
type Assistant = Awaited<ReturnType<StreamResult["result"]>>;

const model = {
  id: "shell-test",
  name: "Shell test",
  api: "openai-completions" as const,
  provider: "shell-test",
  baseUrl: "https://example.invalid",
  reasoning: false,
  input: ["text" as const],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100000,
  maxTokens: 1000,
};

interface SessionOptions {
  cwd: string;
  agentDir: string;
  sessionManager?: SessionManager;
  reason?: SessionStartEvent["reason"];
  systemPrompt?: string;
  appendSystemPrompt?: string[];
  extensionFactories?: ExtensionFactory[];
  projectTrusted?: boolean;
}

function assistant(): Assistant {
  return {
    role: "assistant",
    content: [{ type: "text", text: "Done" }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    stopReason: "stop",
    timestamp: Date.now(),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

export async function createTestSession(options: SessionOptions) {
  const { cwd, agentDir } = options;
  const settingsManager = SettingsManager.inMemory(
    { compaction: { enabled: false }, retry: { enabled: false } },
    { projectTrusted: options.projectTrusted ?? true },
  );
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noThemes: true,
    noContextFiles: true,
    ...(options.systemPrompt === undefined ? {} : { systemPrompt: options.systemPrompt }),
    ...(options.appendSystemPrompt === undefined ? {} : { appendSystemPrompt: options.appendSystemPrompt }),
    additionalExtensionPaths: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    extensionFactories: [
      (pi) =>
        pi.registerProvider(model.provider, {
          api: model.api,
          baseUrl: model.baseUrl,
          apiKey: "test-only",
          models: [model],
        }),
      ...(options.extensionFactories ?? []),
    ],
  });
  await loader.reload();
  const { session, extensionsResult } = await createAgentSession({
    cwd,
    agentDir,
    model,
    resourceLoader: loader,
    settingsManager,
    tools: [],
    sessionManager: options.sessionManager ?? SessionManager.inMemory(cwd),
    sessionStartEvent: { type: "session_start", reason: options.reason ?? "startup" },
  });
  const requests: RequestContext[] = [];
  const controls: { beforeResponse?: (request: number) => Promise<void> } = {};
  session.agent.streamFunction = async (_model, context) => {
    requests.push(structuredClone(context));
    await controls.beforeResponse?.(requests.length);
    const message = assistant();
    return {
      async *[Symbol.asyncIterator]() {
        yield { type: "done", reason: "stop", message };
      },
      result: async () => message,
    } as unknown as StreamResult;
  };
  const notify = vi.fn();
  const errors = vi.fn();
  await session.bindExtensions({ uiContext: { notify } as unknown as ExtensionUIContext, onError: errors });
  return { session, requests, controls, notify, errors, extensionsResult, loader };
}

export function userTexts(context: RequestContext): string[] {
  return context.messages.flatMap((message) => {
    if (message.role !== "user") {
      return [];
    }
    if (typeof message.content === "string") {
      return [message.content];
    }
    return [
      message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(""),
    ];
  });
}
