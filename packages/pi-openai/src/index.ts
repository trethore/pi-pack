import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/shared/events";
import { Command, completeArguments, parseCommand } from "#src/commands";
import {
  Destination,
  configPaths,
  loadConfiguration,
  saveConfiguration,
  saveDestination,
  type ConfigPaths,
} from "#src/config";
import { extensionName } from "#src/constants";
import { transformPayload } from "#src/payload";
import { resolveSettings, type Layers } from "#src/settings";
import { renderStatus, statusMarkdown } from "#src/status";
import { wrapOpenAIProvider } from "#src/transport";

const statusEntry = `${extensionName}-status`;
const saveReminder = `Use /${extensionName} save to save the current settings.`;

interface State {
  paths: ConfigPaths;
  layers: Layers;
}

async function showStatus(state: State, pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  const destination = await saveDestination(state.paths);
  const registered = ctx.model && ctx.modelRegistry.find(ctx.model.provider, ctx.model.id);
  const subscription = registered !== undefined && ctx.modelRegistry.isUsingOAuth(registered);
  const markdown = statusMarkdown(resolveSettings(state.layers), ctx.model, destination, subscription);
  if (ctx.mode === "tui") {
    pi.appendEntry(statusEntry, markdown);
  } else {
    ctx.ui.notify(markdown, "info");
  }
}

async function executeCommand(
  command: Command,
  state: State,
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const { paths, layers } = state;
  switch (command.type) {
    case Command.STATUS:
      await showStatus(state, pi, ctx);
      break;
    case Command.SET:
      Object.assign(layers.command, command.override);
      ctx.ui.notify(
        `${extensionName}: ${command.setting} = ${String(command.override[command.setting])}. ${saveReminder}`,
        "info",
      );
      break;
    case Command.RESET:
      if (command.setting) {
        Reflect.deleteProperty(layers.command, command.setting);
      } else {
        layers.command = {};
      }
      ctx.ui.notify(`${extensionName}: Reset ${command.setting ?? "command overrides"}. ${saveReminder}`, "info");
      break;
    case Command.SAVE: {
      const destination = command.destination ?? (await saveDestination(paths));
      const { values } = resolveSettings(layers);
      await saveConfiguration(paths, destination, values);
      layers[destination] = { ...values };
      ctx.ui.notify(
        destination === Destination.GLOBAL
          ? `${extensionName}: Saved globally.`
          : `${extensionName}: Saved on this project.`,
        "info",
      );
      break;
    }
  }
}

export default function openai(pi: ExtensionAPI): void {
  let state: State | undefined;
  const providerRestorers: Array<() => void> = [];

  function restoreProviders(): void {
    const errors: unknown[] = [];
    for (const restore of providerRestorers.splice(0).toReversed()) {
      try {
        restore();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Could not restore OpenAI providers.");
    }
  }

  pi.on(Events.SessionStart, async (_event, ctx) => {
    state = undefined;
    restoreProviders();
    const paths = configPaths(ctx.cwd);
    try {
      state = { paths, layers: await loadConfiguration(paths) };
      for (const id of ["openai", "openai-codex"]) {
        const provider = ctx.modelRegistry.getProvider(id);
        if (!provider) {
          continue;
        }
        const native = ctx.modelRegistry.getRegisteredNativeProvider(provider.id);
        const config = ctx.modelRegistry.getRegisteredProviderConfig(provider.id);
        const wrapped = wrapOpenAIProvider(
          provider,
          () => state && resolveSettings(state.layers).values,
          (message) => ctx.ui.notify(message, "warning"),
        );
        providerRestorers.push(() => {
          try {
            wrapped.dispose();
          } finally {
            if (ctx.modelRegistry.getRegisteredNativeProvider(provider.id) === wrapped.provider) {
              if (native) {
                pi.registerProvider(native);
              } else if (config) {
                pi.registerProvider(provider.id, config);
              } else {
                pi.unregisterProvider(provider.id);
              }
            }
          }
        });
        pi.registerProvider(wrapped.provider);
      }
    } catch (error) {
      state = undefined;
      restoreProviders();
      throw new Error(`${extensionName}: ${error instanceof Error ? error.message : "Could not load configuration."}`, {
        cause: error,
      });
    }
  });

  pi.on(Events.SessionShutdown, () => {
    state = undefined;
    restoreProviders();
  });

  pi.on(Events.BeforeProviderRequest, (event, ctx) => {
    if (!state) {
      return undefined;
    }
    return transformPayload(event.payload, resolveSettings(state.layers).values, ctx.model);
  });

  pi.registerEntryRenderer<string>(statusEntry, (entry, _options, theme) => {
    if (typeof entry.data !== "string") {
      return undefined;
    }
    return renderStatus(entry.data, theme);
  });

  pi.registerCommand(extensionName, {
    description: "Manage OpenAI request settings; show status, reset overrides, or save configuration",
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
