import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/shared/events";
import { loadConfig } from "#src/config";
import { createCodemodeToolDefinition } from "#src/tool";

export default function tytooCodemode(pi: ExtensionAPI): void {
  let prettyResults = true;

  pi.on(Events.SessionStart, async (_event, ctx) => {
    prettyResults = false;
    const config = await loadConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui });
    prettyResults = config.prettyResults;
  });

  pi.registerTool({
    ...createCodemodeToolDefinition({
      appendEntry: (customType, data) => pi.appendEntry(customType, data),
      models: true,
      getPrettyResults: () => prettyResults,
      getToolNamespace: (name) => pi.getAllTools().find((tool) => tool.name === name)?.namespace,
      getToolGuidelines: () => new Map(pi.getAllTools().map((tool) => [tool.name, tool.promptGuidelines ?? []])),
      getMode: () => (pi.getSettings().codemode?.mode === "only" ? "only" : "on"),
      getInlineBudget: () => pi.getSettings().codemode?.inlineBudget,
    }),
    defaultActive: false,
  });
}
