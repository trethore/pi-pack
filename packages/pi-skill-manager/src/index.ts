import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/shared/events";
import { defaultConfig, loadConfig, projectConfigExists, saveConfig, type ConfigScope } from "./config.ts";
import { selectionEntryType, SessionSelection } from "./selection.ts";
import { SkillManager, type ManagerResult } from "./ui.ts";

function saveScope(action: Exclude<ManagerResult["action"], "session">, projectExists: boolean): ConfigScope {
  if (action !== "save") return action;
  return projectExists ? "project" : "global";
}

export default function skillManager(pi: ExtensionAPI): void {
  const selection = new SessionSelection();

  function persist(): void {
    pi.appendEntry(selectionEntryType, selection.snapshot());
  }

  async function commit(result: ManagerResult, ctx: ExtensionCommandContext, sessionId: string): Promise<void> {
    if (result.action === "session") {
      selection.apply(result.config);
      persist();
      ctx.ui.notify("Skill selection applied for this session.", "info");
      return;
    }

    const projectExists = await projectConfigExists(ctx.cwd);
    const scope = saveScope(result.action, projectExists);
    const shadowed = scope === "global" && projectExists;
    await saveConfig(ctx.cwd, scope, result.config);
    const message = scope === "global" ? "Saved globally." : "Saved for this project.";
    if (ctx.sessionManager.getSessionId() !== sessionId) {
      ctx.ui.notify(`Pi Skill manager: ${message} Session changed; changes apply to future sessions only.`, "info");
      return;
    }
    if (!selection.locked && !shadowed) {
      selection.apply(result.config);
      persist();
    }
    const effect = selection.locked ? " Current session is locked; changes affect future sessions only." : "";
    const warning = shadowed
      ? " The project config takes precedence; this save does not change this project's selection."
      : "";
    ctx.ui.notify(`Pi Skill manager: ${message}${effect}${warning}`, shadowed ? "warning" : "info");
  }

  pi.on(Events.SessionStart, async (_event, ctx) => {
    // Restore the lock first, even if the config file now contains an error.
    selection.restore(ctx.sessionManager.getEntries(), defaultConfig());
    const config = await loadConfig(ctx.cwd);
    selection.restore(ctx.sessionManager.getEntries(), config);
  });

  pi.on(Events.BeforeAgentStart, (event) => {
    const needsSnapshot = !selection.locked || selection.snapshot().advertisements === null;
    event.systemPromptOptions.skills = selection.filter(event.systemPromptOptions.skills);
    if (needsSnapshot) persist();
  });

  pi.registerCommand("skill-manager", {
    description: "Manage skills advertised to the model and save project or global rules",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/skill-manager requires TUI mode.", "error");
        return;
      }
      await ctx.waitForIdle();
      const sessionId = ctx.sessionManager.getSessionId();
      try {
        const savedConfig = await loadConfig(ctx.cwd);
        const config = selection.locked ? savedConfig : selection.config;
        const skills = ctx.getSystemPromptOptions().skills ?? [];
        const result = await ctx.ui.custom<ManagerResult | undefined>(
          (tui, theme, keybindings, done) =>
            new SkillManager(
              config,
              skills,
              selection.locked,
              theme,
              keybindings,
              () => tui.requestRender(),
              done,
              savedConfig,
            ),
        );
        if (result === undefined) return;
        if (ctx.sessionManager.getSessionId() !== sessionId)
          throw new Error("Session changed; open /skill-manager again.");
        await commit(result, ctx, sessionId);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
