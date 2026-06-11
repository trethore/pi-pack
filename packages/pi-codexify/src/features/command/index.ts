import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import type { PiCodexifyConfig } from '#src/config/schema.js';
import { handleCodexAccountCommand } from '#src/features/accounts/index.js';
import {
  buildCodexControlsStatusMessage,
  type CodexControlsController,
  parseCodexReasoningSummary,
  parseCodexVerbosity,
} from '#src/features/codex-controls/index.js';
import { notifyCodexUsage } from '#src/features/usage/index.js';
import {
  buildConfigUpdateMessage,
  resolveConfigScope,
  updateCodexControlConfig,
} from '#src/features/command/config-updates.js';
import { getCodexifyArgumentCompletions, splitArgs } from '#src/features/command/completions.js';

export function registerCodexifyCommand(
  pi: ExtensionAPI,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController | undefined
) {
  pi.registerCommand('codexify', {
    description: 'Control Codex payload options and inspect Codex usage',
    getArgumentCompletions: (prefix) => getCodexifyArgumentCompletions(prefix, config, CODEXIFY_COMMANDS),
    handler: async (args, ctx) => {
      await handleCodexifyCommand(args, ctx, config, codexControls);
    },
  });
}

async function handleCodexifyCommand(
  args: string,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController | undefined
): Promise<void> {
  const parts = splitArgs(args);
  const commandName = parts[0] ?? 'help';
  const command = findCodexifyCommand(commandName);

  if (!command) {
    ctx.ui.notify(buildUsageMessage(config), 'warning');
    return;
  }

  await command.handle(parts, ctx, config, codexControls);
}

interface CodexifyCommand {
  name: string;
  usage: string;
  aliases?: readonly string[];
  needsMoreArgs?: boolean;
  isAvailable(config: PiCodexifyConfig): boolean;
  handle(
    parts: readonly string[],
    ctx: ExtensionCommandContext,
    config: PiCodexifyConfig,
    codexControls: CodexControlsController | undefined
  ): Promise<void> | void;
}

const CODEXIFY_COMMANDS: readonly CodexifyCommand[] = [
  {
    name: 'help',
    usage: '/codexify help',
    isAvailable: () => true,
    handle(_parts, ctx, config) {
      ctx.ui.notify(buildUsageMessage(config), 'info');
    },
  },
  {
    name: 'status',
    usage: '/codexify status',
    isAvailable: () => true,
    handle(_parts, ctx, config, codexControls) {
      ctx.ui.notify(buildStatusMessage(config, ctx, codexControls), 'info');
    },
  },
  {
    name: 'usage',
    usage: '/codexify usage',
    isAvailable: (config) => config.usage.enabled,
    async handle(_parts, ctx, config) {
      await handleUsageCommand(ctx, config);
    },
  },
  {
    name: 'account',
    usage: '/codexify account list|current|save <name>|use <name>|delete <name>',
    needsMoreArgs: true,
    isAvailable: (config) => config.account.enabled,
    async handle(parts, ctx, config) {
      await handleAccountCommand(parts, ctx, config);
    },
  },
  {
    name: 'verbosity',
    usage: '/codexify verbosity low|medium|high|off',
    needsMoreArgs: true,
    isAvailable: (config) => config.codex.enabled,
    async handle(parts, ctx, config, codexControls) {
      await handleVerbosityCommand(parts[1], ctx, config, codexControls);
    },
  },
  {
    name: 'reasoning-summary',
    usage: '/codexify reasoning-summary auto|concise|detailed|off',
    aliases: ['summary'],
    needsMoreArgs: true,
    isAvailable: (config) => config.codex.enabled,
    async handle(parts, ctx, config, codexControls) {
      await handleReasoningSummaryCommand(parts[1], ctx, config, codexControls);
    },
  },
];

function findCodexifyCommand(commandName: string): CodexifyCommand | undefined {
  return CODEXIFY_COMMANDS.find((command) => command.name === commandName || command.aliases?.includes(commandName));
}

async function handleUsageCommand(ctx: ExtensionCommandContext, config: PiCodexifyConfig): Promise<void> {
  if (!config.usage.enabled) {
    ctx.ui.notify('codexify usage is disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  await notifyCodexUsage(ctx);
}

async function handleAccountCommand(
  parts: readonly string[],
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  if (!config.account.enabled) {
    ctx.ui.notify('codexify account is disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  await handleCodexAccountCommand(parts, ctx);
}

async function handleVerbosityCommand(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController | undefined
): Promise<void> {
  if (!config.codex.enabled) {
    ctx.ui.notify('codexify codex controls are disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  const controls = getCodexControls(codexControls);
  if (value === undefined) {
    ctx.ui.notify(buildCodexControlsStatusMessage(controls.getConfig(), ctx.model), 'info');
    return;
  }

  const parsedValue = parseCodexVerbosity(value);
  if (parsedValue === undefined) {
    ctx.ui.notify('Usage: /codexify verbosity low|medium|high|off', 'warning');
    return;
  }

  try {
    const scope = resolveConfigScope();
    await updateCodexControlConfig(scope, 'verbosity', parsedValue);
    controls.updateVerbosity(parsedValue === 'off' ? undefined : parsedValue);
    ctx.ui.notify(buildConfigUpdateMessage('Codex verbosity', parsedValue, scope), 'info');
  } catch (error) {
    ctx.ui.notify(`codexify verbosity failed: ${getErrorMessage(error)}`, 'error');
  }
}

async function handleReasoningSummaryCommand(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController | undefined
): Promise<void> {
  if (!config.codex.enabled) {
    ctx.ui.notify('codexify codex controls are disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  const controls = getCodexControls(codexControls);
  if (value === undefined) {
    ctx.ui.notify(buildCodexControlsStatusMessage(controls.getConfig(), ctx.model), 'info');
    return;
  }

  const parsedValue = parseCodexReasoningSummary(value);
  if (parsedValue === undefined) {
    ctx.ui.notify('Usage: /codexify reasoning-summary auto|concise|detailed|off', 'warning');
    return;
  }

  try {
    const scope = resolveConfigScope();
    await updateCodexControlConfig(scope, 'reasoningSummary', parsedValue);
    controls.updateReasoningSummary(parsedValue === 'off' ? undefined : parsedValue);
    ctx.ui.notify(buildConfigUpdateMessage('Codex reasoning summary', parsedValue, scope), 'info');
  } catch (error) {
    ctx.ui.notify(`codexify reasoning-summary failed: ${getErrorMessage(error)}`, 'error');
  }
}

function buildStatusMessage(
  config: PiCodexifyConfig,
  ctx: ExtensionCommandContext,
  codexControls: CodexControlsController | undefined
): string {
  const lines = [
    'pi-codexify',
    `codex controls enabled: ${config.codex.enabled ? 'yes' : 'no'}`,
    `usage command enabled: ${config.usage.enabled ? 'yes' : 'no'}`,
    `account command enabled: ${config.account.enabled ? 'yes' : 'no'}`,
    `native web_search enabled: ${config.webSearch.enabled ? 'yes' : 'no'}`,
  ];

  if (config.codex.enabled) {
    const controls = getCodexControls(codexControls);
    lines.push('', buildCodexControlsStatusMessage(controls.getConfig(), ctx.model));
  }

  return lines.join('\n');
}

function getCodexControls(codexControls: CodexControlsController | undefined): CodexControlsController {
  if (codexControls) return codexControls;
  throw new Error('codex controls are not registered');
}

function buildUsageMessage(config: PiCodexifyConfig): string {
  const commandUsageLines = CODEXIFY_COMMANDS.filter((command) => command.isAvailable(config)).map(
    (command) => command.usage
  );

  return ['pi-codexify commands', ...commandUsageLines].join('\n');
}
