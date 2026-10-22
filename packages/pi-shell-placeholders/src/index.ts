import type {
  ExtensionAPI,
  ExtensionContext,
  NormalizedBuildSystemPromptOptions,
} from "@earendil-works/pi-coding-agent";
import { registerPromptTemplateTransform } from "@pi-pack/monkey-patching/prompt-templates";
import { Events } from "@pi-pack/events";
import { loadConfig, type ShellConfig } from "#src/config";
import { expandPlaceholders } from "#src/placeholders";
import { newGeneration, restoreGeneration, STATE_TYPE, type Generation, type ResolvedGeneration } from "#src/state";

interface Runtime {
  config: ShellConfig;
  generation: Generation;
  controller: AbortController;
  releaseTemplateHook?: () => void;
}

function applyGeneration(options: NormalizedBuildSystemPromptOptions, generation: ResolvedGeneration): void {
  if (generation.customPrompt === null) {
    Reflect.deleteProperty(options, "customPrompt");
  } else if (generation.customPrompt !== undefined) {
    options.customPrompt = generation.customPrompt;
  }
  if (generation.appendSystemPrompt !== undefined) {
    options.appendSystemPrompt = generation.appendSystemPrompt;
  }
}

function expand(text: string, runtime: Runtime, ctx: ExtensionContext, operationSignal?: AbortSignal): Promise<string> {
  const signal = operationSignal
    ? AbortSignal.any([runtime.controller.signal, operationSignal])
    : runtime.controller.signal;
  const ui = ctx.ui;
  return expandPlaceholders(text, {
    execution: runtime.config.execution,
    cwd: ctx.cwd,
    signal,
    warn: (message) => ui.notify(message, "warning"),
  });
}

async function resolveGeneration(
  options: NormalizedBuildSystemPromptOptions,
  runtime: Runtime,
  ctx: ExtensionContext,
): Promise<ResolvedGeneration> {
  const generation: ResolvedGeneration = { version: 1, status: "resolved" };
  if (runtime.config.surfaces.system) {
    generation.customPrompt =
      options.customPrompt === undefined ? null : await expand(options.customPrompt, runtime, ctx, ctx.signal);
  }
  if (runtime.config.surfaces.appendSystem) {
    generation.appendSystemPrompt = await expand(options.appendSystemPrompt, runtime, ctx, ctx.signal);
  }
  runtime.controller.signal.throwIfAborted();
  return generation;
}

export default function shellPlaceholders(pi: ExtensionAPI): void {
  let runtime: Runtime | undefined;
  const stop = (): void => {
    const active = runtime;
    runtime = undefined;
    active?.controller.abort();
    active?.releaseTemplateHook?.();
  };

  function createRuntime(ctx: ExtensionContext, config: ShellConfig, reset = false): Runtime {
    const saved = reset ? undefined : restoreGeneration(ctx.sessionManager.getBranch());
    const generation = saved ?? newGeneration();
    if (!saved) {
      pi.appendEntry(STATE_TYPE, generation);
    }
    const active: Runtime = { config, generation, controller: new AbortController() };
    if (config.enabled && config.surfaces.promptTemplates) {
      active.releaseTemplateHook = registerPromptTemplateTransform(ctx, (event, context) =>
        expand(event.text, active, context, event.signal),
      );
    }
    return active;
  }

  pi.on(Events.SessionStart, async (event, ctx) => {
    stop();
    const config = await loadConfig(ctx.cwd, {
      projectTrusted: ctx.isProjectTrusted(),
      ui: ctx.ui,
    });
    runtime = createRuntime(ctx, config, event.reason === "reload" || event.reason === "new");
  });

  pi.on(Events.BeforeAgentStart, async (event, ctx) => {
    const active = runtime;
    if (!active?.config.enabled) {
      return;
    }
    if (active.generation.status === "pending") {
      const generation = await resolveGeneration(event.systemPromptOptions, active, ctx);
      pi.appendEntry(STATE_TYPE, generation);
      active.generation = generation;
    }
    applyGeneration(event.systemPromptOptions, active.generation);
  });

  pi.on("session_tree", (_event, ctx) => {
    if (!runtime) {
      return;
    }
    const { config } = runtime;
    stop();
    runtime = createRuntime(ctx, config);
  });

  pi.on(Events.SessionShutdown, stop);
}
