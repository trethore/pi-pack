import { Events } from "@pi-pack/shared/events";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
  InputEvent,
  SessionStartEvent,
  SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";
import scriptTemplates from "#src/index";

export function createHarness(cwd: string, commands: SlashCommandInfo[] = [], trusted = true) {
  const handlers = new Map<ExtensionEvent["type"], (event: never, ctx: ExtensionContext) => unknown>();
  const notify = vi.fn();
  const ctx = { cwd, isProjectTrusted: () => trusted, ui: { notify } } as unknown as ExtensionContext;
  const pi = {
    on(name: ExtensionEvent["type"], handler: (event: never, ctx: ExtensionContext) => unknown) {
      handlers.set(name, handler);
    },
    getCommands: () => commands,
  } as unknown as ExtensionAPI;
  scriptTemplates(pi);
  const emit = async (name: ExtensionEvent["type"], event: unknown = {}) => {
    const handler = handlers.get(name);
    if (!handler) {
      throw new Error(`Missing handler: ${name}`);
    }
    return handler(event as never, ctx);
  };
  return {
    notify,
    emit,
    start(reason: SessionStartEvent["reason"] = "startup") {
      return emit(Events.SessionStart, { reason });
    },
    input(text: string, source: InputEvent["source"] = "interactive") {
      return emit(Events.Input, { text, source });
    },
    async system(customPrompt = "{{platform}}", appendSystemPrompt = "{{platform}}") {
      const options: BeforeAgentStartEvent["systemPromptOptions"] = {
        cwd,
        customPrompt,
        appendSystemPrompt,
        contextFiles: [{ path: "AGENTS.md", content: "{{platform}}" }],
        sections: { other: "{{platform}}" },
        selectedTools: [],
        hiddenTools: [],
        toolSnippets: {},
        toolGuidelines: {},
        promptGuidelines: [],
        skills: [],
      };
      await emit(Events.BeforeAgentStart, { systemPromptOptions: options });
      return options;
    },
  };
}
