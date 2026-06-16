import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import type { PiCodexifyConfig } from '#src/config/schema.js';
import { handleCodexAccountCommand } from '#src/features/accounts/index.js';
import {
  buildCodexControlsStatusMessage,
  type CodexControlsController,
  parseCodexReasoningSummary,
  parseCodexServiceTier,
  parseCodexVerbosity,
} from '#src/features/codex-controls/index.js';
import {
  handleResetCreditCountCommand,
  handleUseResetCreditCommand,
  parseResetCreditAction,
} from '#src/features/reset-credit/index.js';
import { notifyCodexUsage } from '#src/features/usage/index.js';
import {
  buildConfigUpdateMessage,
  type CodexControlValue,
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
    name: 'reset',
    usage: '/codexify reset use|count',
    needsMoreArgs: true,
    isAvailable: (config) => config.reset.enabled,
    async handle(parts, ctx, config) {
      await handleResetCommand(parts, ctx, config);
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
  {
    name: 'serviceTier',
    usage: '/codexify serviceTier slow|fast',
    needsMoreArgs: true,
    isAvailable: (config) => config.codex.enabled,
    async handle(parts, ctx, config, codexControls) {
      await handleServiceTierCommand(parts[1], ctx, config, codexControls);
    },
  },
];

const RESET_COMMAND_USAGE = 'Usage: /codexify reset use|count';

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

async function handleResetCommand(
  parts: readonly string[],
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  if (!config.reset.enabled) {
    ctx.ui.notify('codexify reset is disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  const action = parseResetCreditAction(parts[1]);

  if (action === 'use') await handleUseResetCreditCommand(ctx);
  else if (action === 'count') await handleResetCreditCountCommand(ctx);
  else ctx.ui.notify(RESET_COMMAND_USAGE, 'warning');
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
  await handleCodexControlUpdate(value, ctx, config, codexControls, {
    commandName: 'verbosity',
    usage: 'Usage: /codexify verbosity low|medium|high|off',
    label: 'Codex verbosity',
    configKey: 'verbosity',
    parse: parseCodexVerbosity,
    update: (controls, parsedValue) => controls.updateVerbosity(parsedValue === 'off' ? undefined : parsedValue),
  });
}

async function handleReasoningSummaryCommand(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController | undefined
): Promise<void> {
  await handleCodexControlUpdate(value, ctx, config, codexControls, {
    commandName: 'reasoning-summary',
    usage: 'Usage: /codexify reasoning-summary auto|concise|detailed|off',
    label: 'Codex reasoning summary',
    configKey: 'reasoningSummary',
    parse: parseCodexReasoningSummary,
    update: (controls, parsedValue) => controls.updateReasoningSummary(parsedValue === 'off' ? undefined : parsedValue),
  });
}

async function handleServiceTierCommand(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController | undefined
): Promise<void> {
  await handleCodexControlUpdate(value, ctx, config, codexControls, {
    commandName: 'serviceTier',
    usage: 'Usage: /codexify serviceTier slow|fast',
    label: 'Codex service tier',
    configKey: 'serviceTier',
    parse: parseCodexServiceTier,
    update: (controls, parsedValue) => controls.updateServiceTier(parsedValue),
  });
}

interface CodexControlUpdateOptions<TValue extends CodexControlValue> {
  commandName: string;
  usage: string;
  label: string;
  configKey: 'verbosity' | 'reasoningSummary' | 'serviceTier';
  parse(value: string): TValue | undefined;
  update(controls: CodexControlsController, parsedValue: TValue): void;
}

async function handleCodexControlUpdate<TValue extends CodexControlValue>(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController | undefined,
  options: CodexControlUpdateOptions<TValue>
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

  const parsedValue = options.parse(value);
  if (parsedValue === undefined) {
    ctx.ui.notify(options.usage, 'warning');
    return;
  }

  await updateCodexControlValue(ctx, controls, parsedValue, options);
}

async function updateCodexControlValue<TValue extends CodexControlValue>(
  ctx: ExtensionCommandContext,
  controls: CodexControlsController,
  parsedValue: TValue,
  options: CodexControlUpdateOptions<TValue>
): Promise<void> {
  try {
    const scope = resolveConfigScope();
    await updateCodexControlConfig(scope, options.configKey, parsedValue);
    options.update(controls, parsedValue);
    ctx.ui.notify(buildConfigUpdateMessage(options.label, parsedValue, scope), 'info');
  } catch (error) {
    ctx.ui.notify(`codexify ${options.commandName} failed: ${getErrorMessage(error)}`, 'error');
  }
}

function buildStatusMessage(
  config: PiCodexifyConfig,
  ctx: ExtensionCommandContext,
  codexControls: CodexControlsController | undefined
): string {
  return [
    'pi-codexify',
    ...formatFeatureStatusLines(config),
    ...formatCodexControlStatusLines(config, ctx, codexControls),
  ].join('\n');
}

function formatFeatureStatusLines(config: PiCodexifyConfig): string[] {
  return [
    formatEnabledLine('codex controls', config.codex.enabled),
    formatEnabledLine('usage command', config.usage.enabled),
    formatEnabledLine('reset command', config.reset.enabled),
    formatEnabledLine('account command', config.account.enabled),
    formatEnabledLine('native web_search', config.webSearch.enabled),
  ];
}

function formatCodexControlStatusLines(
  config: PiCodexifyConfig,
  ctx: ExtensionCommandContext,
  codexControls: CodexControlsController | undefined
): string[] {
  if (!config.codex.enabled) return [];
  const controls = getCodexControls(codexControls);
  return ['', buildCodexControlsStatusMessage(controls.getConfig(), ctx.model)];
}

function formatEnabledLine(label: string, enabled: boolean): string {
  return `${label} enabled: ${enabled ? 'yes' : 'no'}`;
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
