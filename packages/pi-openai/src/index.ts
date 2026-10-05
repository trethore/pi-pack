import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/shared/events";
import { Command, completeArguments, parseCommand } from "#src/ui/commands";
import {
  Destination,
  configPaths,
  loadConfiguration,
  saveConfiguration,
  defaultDestination,
  type ConfigPaths,
} from "#src/config/files";
import {
  completeSave,
  prepareSave,
  undoCommand,
  unsetCommand,
  unsetTarget,
  setCommand,
  type Changes,
} from "#src/config/changes";
import { commandScope, scopeId, scopeLabel } from "#src/config/scopes";
import { extensionName } from "#src/constants";
import { transformPayload } from "#src/request/payload";
import { resolveSettings, type Layers } from "#src/config/settings";
import { renderStatus, statusMarkdown } from "#src/ui/status";

const statusEntry = `${extensionName}-status`;
const saveReminder = `Use /${extensionName} save to save pending edits.`;

interface State {
  paths: ConfigPaths;
  layers: Layers;
  changes: Changes;
  saving: boolean;
}

async function executeSave(
  command: Extract<Command, { type: "save" }>,
  state: State,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (state.saving) {
    throw new Error("A save is already in progress.");
  }
  const batch = prepareSave(state.changes, command);
  if (batch.some((patch) => patch.destination === Destination.PROJECT) && !ctx.isProjectTrusted()) {
    throw new Error("Project is not trusted; refusing to save project configuration.");
  }
  if (batch.length === 0) {
    ctx.ui.notify(`${extensionName}: No pending edits to save.`, "info");
    return;
  }
  state.saving = true;
  try {
    for (const destination of [Destination.GLOBAL, Destination.PROJECT]) {
      const patches = batch.filter((patch) => patch.destination === destination);
      if (patches.length === 0) {
        continue;
      }
      await saveConfiguration(state.paths, destination, patches, { projectTrusted: ctx.isProjectTrusted() });
      completeSave(state.changes, patches);
      ctx.ui.notify(
        `${extensionName}: Saved to ${destination}. Applies on next session/reload; active settings unchanged.`,
        "info",
      );
    }
  } finally {
    state.saving = false;
  }
}

async function executeSet(
  command: Extract<Command, { type: "set" }>,
  { layers, changes, paths }: State,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const match = commandScope(layers, ctx.model, command.scope, changes.pending);
  if (command.source === Destination.PROJECT && !ctx.isProjectTrusted()) {
    throw new Error("Project is not trusted; refusing to edit project configuration.");
  }
  const fallback =
    command.source === Destination.GLOBAL
      ? Destination.GLOBAL
      : await defaultDestination(paths, { projectTrusted: ctx.isProjectTrusted() });
  const destination = command.source ?? fallback;
  if (destination === Destination.PROJECT && !ctx.isProjectTrusted()) {
    throw new Error("Project is not trusted; refusing to edit project configuration.");
  }
  setCommand(layers, changes, match, command.override, destination);
  const effective = resolveSettings(layers, ctx.model);
  const masked = scopeId(effective.scopes[command.setting]) !== scopeId(match);
  const detail = masked
    ? ` Masked by ${scopeLabel(effective.scopes[command.setting])}; effective value = ${String(effective.values[command.setting])}.`
    : "";
  const creation =
    destination === Destination.PROJECT && fallback === Destination.GLOBAL
      ? " Project configuration will be created on save."
      : "";
  ctx.ui.notify(
    `${extensionName}: ${command.setting} = ${String(command.override[command.setting])}. Scope: ${scopeLabel(match)}. Source: ${destination}. Temporary, unsaved.${creation}${detail} ${saveReminder}`,
    "info",
  );
}

function executeUnset(
  command: Extract<Command, { type: "unset" }>,
  { layers, changes }: State,
  ctx: ExtensionCommandContext,
): void {
  const target = unsetTarget(layers, changes, ctx.model, command.setting, command.scope, ctx.isProjectTrusted());
  if (!target) {
    ctx.ui.notify(`${extensionName}: Nothing to unset for ${command.setting}. No pending edit added.`, "info");
    return;
  }
  const { match, destination } = target;
  unsetCommand(layers, changes, match, command.setting, destination);
  ctx.ui.notify(
    `${extensionName}: Unset ${command.setting}. Scope: ${scopeLabel(match)}. Source: ${destination}. Loaded configuration unchanged until next session/reload. ${saveReminder}`,
    "info",
  );
}

async function executeCommand(
  command: Command,
  state: State,
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const { paths, layers, changes } = state;
  switch (command.type) {
    case Command.STATUS: {
      const destination = await defaultDestination(paths, { projectTrusted: ctx.isProjectTrusted() });
      const markdown = statusMarkdown(layers, ctx.model, destination, changes);
      if (ctx.mode === "tui") {
        pi.appendEntry(statusEntry, markdown);
      } else {
        ctx.ui.notify(markdown, "info");
      }
      break;
    }
    case Command.SET:
      await executeSet(command, state, ctx);
      break;
    case Command.UNSET:
      executeUnset(command, state, ctx);
      break;
    case Command.UNDO: {
      const match = command.allScopes ? undefined : commandScope(layers, ctx.model, command.scope, changes.pending);
      undoCommand(layers, changes, match, command.setting);
      ctx.ui.notify(
        `${extensionName}: Undid ${command.setting ?? "command overrides and pending edits"}. Scope: ${match ? scopeLabel(match) : "all scopes"}. Configuration files unchanged.`,
        "info",
      );
      break;
    }
    case Command.SAVE:
      await executeSave(command, state, ctx);
      break;
  }
}

export default function openai(pi: ExtensionAPI): void {
  let state: State | undefined;

  pi.on(Events.SessionStart, async (_event, ctx) => {
    state = undefined;
    const paths = configPaths(ctx.cwd);
    try {
      state = {
        paths,
        layers: await loadConfiguration(paths, { projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui }),
        changes: { pending: [], receipts: [] },
        saving: false,
      };
    } catch (error) {
      throw new Error(`${extensionName}: ${error instanceof Error ? error.message : "Could not load configuration."}`, {
        cause: error,
      });
    }
  });

  pi.on(Events.BeforeProviderRequest, (event, ctx) => {
    if (!state) {
      return undefined;
    }
    return transformPayload(
      event.payload,
      resolveSettings(state.layers, ctx.model).values,
      ctx.model,
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME_MAP,
    );
  });

  pi.registerEntryRenderer<string>(statusEntry, (entry, _options, theme) => {
    if (typeof entry.data !== "string") {
      return undefined;
    }
    return renderStatus(entry.data, theme);
  });

  pi.registerCommand(extensionName, {
    description: "Manage scoped OpenAI request settings; undo overrides, unset saved settings, or save pending edits",
    getArgumentCompletions: completeArguments,
    handler: async (args, ctx) => {
      try {
        const command = parseCommand(args);
        if (!state) {
          throw new Error("Configuration is unavailable. Fix configuration and run /reload.");
        }
        await executeCommand(command, state, pi, ctx);
      } catch (error) {
        ctx.ui.notify(`${extensionName}: ${error instanceof Error ? error.message : "Command failed."}`, "error");
      }
    },
  });
}
