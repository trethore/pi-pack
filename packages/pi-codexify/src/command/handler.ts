import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { PiCodexifyConfig } from '#src/config/types.js';
import { handleResetDetails, handleUseReset, parseResetAction } from '#src/codex/reset.js';
import { notifyUsage } from '#src/codex/usage.js';
import { buildControlsStatus } from '#src/control/status.js';
import { buildUsage, normalizeCommand } from '#src/command/definitions.js';
import { handleControlCommand } from '#src/command/control-command.js';

export async function handleCommand(
  args: string,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  if (!config.enabled) {
    ctx.ui.notify('pi-codexify is disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  const parts = splitArgs(args);
  await dispatchCommand(normalizeCommand(parts[0] ?? 'help'), parts, ctx, config);
}

async function dispatchCommand(
  command: ReturnType<typeof normalizeCommand>,
  parts: readonly string[],
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  switch (command) {
    case 'help': {
      ctx.ui.notify(buildUsage(config), 'info');
      return;
    }
    case 'status': {
      ctx.ui.notify(buildStatus(config, ctx), 'info');
      return;
    }
    case 'usage': {
      if (!config.usage) return notifyDisabled(ctx, 'usage');
      await notifyUsage(ctx);
      return;
    }
    case 'reset': {
      await handleReset(parts[1], ctx, config);
      return;
    }
    case 'verbosity':
    case 'reasoning-summary':
    case 'service-tier': {
      await handleControlCommand(command, parts[1], ctx, config);
      return;
    }
    default: {
      ctx.ui.notify(buildUsage(config), 'warning');
    }
  }
}

export function splitArgs(args: string): string[] {
  const trimmed = args.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

async function handleReset(
  action: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  if (!config.reset) return notifyDisabled(ctx, 'reset');
  const parsedAction = parseResetAction(action);
  if (!parsedAction) {
    ctx.ui.notify('Usage: /codexify reset use|details', 'warning');
    return;
  }

  await (parsedAction === 'use' ? handleUseReset(ctx) : handleResetDetails(ctx));
}

function buildStatus(config: PiCodexifyConfig, ctx: ExtensionCommandContext): string {
  return [
    'pi-codexify',
    `controls enabled: ${yesNo(config.controls.enabled)}`,
    `usage command enabled: ${yesNo(config.usage)}`,
    `reset command enabled: ${yesNo(config.reset)}`,
    ...(config.controls.enabled ? ['', buildControlsStatus(config.controls, ctx.model)] : []),
  ].join('\n');
}

function notifyDisabled(ctx: ExtensionCommandContext, command: 'usage' | 'reset'): void {
  ctx.ui.notify(`codexify ${command} is disabled in pi-codexify.jsonc.`, 'warning');
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}
