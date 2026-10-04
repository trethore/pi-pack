import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/shared/events";
import { expandPrompt } from "#src/prompts/expansion";
import { clearWorkspaces, getWorkspace, type Workspace } from "#src/workspace";

function reportWarnings(workspace: Workspace, ctx: ExtensionContext): void {
  for (const warning of workspace.warnings.splice(0)) {
    ctx.ui.notify(warning, "warning");
  }
}

function currentWorkspace(ctx: ExtensionContext): Promise<Workspace> {
  return getWorkspace(ctx.cwd, getAgentDir(), ctx.isProjectTrusted());
}

export default function scriptTemplates(pi: ExtensionAPI): void {
  pi.on(Events.SessionStart, async (event, ctx) => {
    if (event.reason === "reload") {
      clearWorkspaces();
    }
    reportWarnings(await currentWorkspace(ctx), ctx);
  });

  pi.on(Events.BeforeAgentStart, async (event, ctx) => {
    const workspace = await currentWorkspace(ctx);
    const { config, templates } = workspace;
    if (!config?.enabled || !templates) {
      reportWarnings(workspace, ctx);
      return;
    }
    const options = event.systemPromptOptions;
    if (config.surfaces.system && options.customPrompt !== undefined) {
      options.customPrompt = await templates.expand(options.customPrompt);
    }
    if (config.surfaces.appendSystem) {
      options.appendSystemPrompt = await templates.expand(options.appendSystemPrompt);
    }
    reportWarnings(workspace, ctx);
  });

  pi.on(Events.Input, async (event, ctx) => {
    const workspace = await currentWorkspace(ctx);
    if (!workspace.config?.enabled || !workspace.config.surfaces.promptTemplates) {
      reportWarnings(workspace, ctx);
      return { action: "continue" };
    }
    const text = await expandPrompt(event.text, pi.getCommands(), workspace, ctx.isProjectTrusted());
    reportWarnings(workspace, ctx);
    if (text === undefined) {
      return { action: "continue" };
    }
    // Pi expands slash commands after input hooks; a leading newline keeps rendered text literal.
    return { action: "transform", text: text.startsWith("/") ? `\n${text}` : text };
  });
}
