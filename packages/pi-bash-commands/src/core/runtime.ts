import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';

import type { PiBashCommandsConfig } from '#src/config/schema.js';
import { isBuiltInBashAvailable } from '#src/core/availability.js';
import { createCommandShims, type CommandShims } from '#src/core/shims.js';

export interface BashCommandsRuntime {
  ensure(ctx: ExtensionContext): Promise<CommandShims | undefined>;
  dispose(): Promise<void>;
}

interface RuntimeState {
  pi: Pick<ExtensionAPI, 'getActiveTools' | 'getAllTools'>;
  config: PiBashCommandsConfig;
  shims?: CommandShims;
  setup?: Promise<CommandShims>;
  unavailableWarningShown: boolean;
  setupWarningShown: boolean;
}

export function createBashCommandsRuntime(
  pi: Pick<ExtensionAPI, 'getActiveTools' | 'getAllTools'>,
  config: PiBashCommandsConfig
): BashCommandsRuntime {
  const state: RuntimeState = {
    pi,
    config,
    unavailableWarningShown: false,
    setupWarningShown: false,
  };

  return {
    ensure: (ctx) => ensureRuntime(state, ctx),
    dispose: () => disposeRuntime(state),
  };
}

async function ensureRuntime(state: RuntimeState, ctx: ExtensionContext): Promise<CommandShims | undefined> {
  const commands = state.config.commands.filter((command) => command.enabled);
  if (!state.config.enabled || commands.length === 0) {
    await disposeShims(state);
    return;
  }

  if (!isBuiltInBashAvailable(state.pi)) {
    await disableForUnavailableBash(state, ctx);
    return;
  }

  state.unavailableWarningShown = false;
  return ensureShims(state, commands, ctx);
}

async function disableForUnavailableBash(state: RuntimeState, ctx: ExtensionContext): Promise<void> {
  await disposeShims(state);
  if (state.unavailableWarningShown) return;

  ctx.ui.notify("pi-bash-commands disabled: Pi's active built-in bash tool is unavailable.", 'warning');
  state.unavailableWarningShown = true;
}

async function ensureShims(
  state: RuntimeState,
  commands: PiBashCommandsConfig['commands'],
  ctx: ExtensionContext
): Promise<CommandShims | undefined> {
  if (state.shims) return state.shims;
  const setup = (state.setup ??= createCommandShims(commands));

  try {
    const shims = await setup;
    if (state.setup !== setup) return state.shims;

    state.shims = shims;
    state.setupWarningShown = false;
    return shims;
  } catch (error) {
    if (state.setup === setup) notifySetupFailure(state, ctx, error);
    return;
  } finally {
    if (state.setup === setup) state.setup = undefined;
  }
}

function notifySetupFailure(state: RuntimeState, ctx: ExtensionContext, error: unknown): void {
  if (state.setupWarningShown) return;

  ctx.ui.notify(`pi-bash-commands disabled: ${getErrorMessage(error)}`, 'warning');
  state.setupWarningShown = true;
}

async function disposeShims(state: RuntimeState): Promise<void> {
  const currentShims = state.shims;
  const pendingSetup = state.setup;
  state.shims = undefined;
  state.setup = undefined;

  const shims = currentShims ? [currentShims] : [];
  if (pendingSetup) {
    const [result] = await Promise.allSettled([pendingSetup]);
    if (result.status === 'fulfilled') shims.push(result.value);
  }

  const uniqueShims = new Map(shims.map((value) => [value.directory, value]));
  await Promise.allSettled([...uniqueShims.values()].map((value) => value.dispose()));
}

async function disposeRuntime(state: RuntimeState): Promise<void> {
  await disposeShims(state);
  state.unavailableWarningShown = false;
  state.setupWarningShown = false;
}
