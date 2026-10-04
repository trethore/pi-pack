import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";
import scriptTemplates from "#src/index";

export function createHarness(cwd: string, commands: SlashCommandInfo[] = [], trusted = true) {
  const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
  const notify = vi.fn();
  const ctx = { cwd, isProjectTrusted: () => trusted, ui: { notify } } as unknown as ExtensionContext;
  const pi = {
    on(name: string, handler: (event: never, ctx: ExtensionContext) => unknown) {
      handlers.set(name, handler);
    },
    getCommands: () => commands,
  } as unknown as ExtensionAPI;
  scriptTemplates(pi);
  const emit = async (name: string, event: unknown = {}) => {
    const handler = handlers.get(name);
    if (!handler) {
      throw new Error(`Missing handler: ${name}`);
    }
    return handler(event as never, ctx);
  };
  return {
    notify,
    emit,
    start(reason = "startup") {
      return emit("session_start", { reason });
    },
    input(text: string, source = "interactive") {
      return emit("input", { text, source });
    },
    async system(customPrompt = "{{platform}}", appendSystemPrompt = "{{platform}}") {
      const options: BeforeAgentStartEvent["systemPromptOptions"] = {
        cwd,
        customPrompt,
        appendSystemPrompt,
        contextFiles: [{ path: "AGENTS.md", content: "{{platform}}" }],
        sections: { other: "{{platform}}" },
        selectedTools: [],
        toolSnippets: {},
        toolGuidelines: {},
        promptGuidelines: [],
        skills: [],
      };
      await emit("before_agent_start", { systemPromptOptions: options });
      return options;
    },
  };
}
