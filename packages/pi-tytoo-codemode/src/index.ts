import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodemodeToolDefinition } from "#src/tool";

export default function tytooCodemode(pi: ExtensionAPI): void {
  pi.registerTool({
    ...createCodemodeToolDefinition({
      appendEntry: (customType, data) => pi.appendEntry(customType, data),
      models: true,
      getToolNamespace: (name) => pi.getAllTools().find((tool) => tool.name === name)?.namespace,
      getToolGuidelines: () => new Map(pi.getAllTools().map((tool) => [tool.name, tool.promptGuidelines ?? []])),
      getMode: () => (pi.getSettings().codemode?.mode === "only" ? "only" : "on"),
      getInlineBudget: () => pi.getSettings().codemode?.inlineBudget,
    }),
    defaultActive: false,
  });
}
