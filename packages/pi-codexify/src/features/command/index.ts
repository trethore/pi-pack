import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import type { PiCodexifyConfig } from '#src/config/schema.js';
import {
  buildCodexControlsStatusMessage,
  parseCodexReasoningSummary,
  parseCodexServiceTier,
  parseCodexVerbosity,
} from '#src/features/codex-controls/index.js';
import {
  handleResetCreditDetailsCommand,
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

export function registerCodexifyCommand(pi: ExtensionAPI, config: PiCodexifyConfig) {
  pi.registerCommand('codexify', {
    description: 'Control Codex payload options and inspect Codex usage',
    getArgumentCompletions: (prefix) => getCodexifyArgumentCompletions(prefix, config, CODEXIFY_COMMANDS),
    handler: async (args, ctx) => {
      await handleCodexifyCommand(args, ctx, config);
    },
  });
}

async function handleCodexifyCommand(
  args: string,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  if (!config.enabled) {
    ctx.ui.notify('pi-codexify is disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  const parts = splitArgs(args);
  const commandName = parts[0] ?? 'help';
  const command = findCodexifyCommand(commandName);

  if (!command) {
    ctx.ui.notify(buildUsageMessage(config), 'warning');
    return;
  }

  await command.handle(parts, ctx, config);
}

interface CodexifyCommand {
  name: string;
  usage: string;
  aliases?: readonly string[];
  needsMoreArgs?: boolean;
  isAvailable(config: PiCodexifyConfig): boolean;
  handle(parts: readonly string[], ctx: ExtensionCommandContext, config: PiCodexifyConfig): Promise<void> | void;
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
    handle(_parts, ctx, config) {
      ctx.ui.notify(buildStatusMessage(config, ctx), 'info');
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
    usage: '/codexify reset use|details',
    needsMoreArgs: true,
    isAvailable: (config) => config.reset.enabled,
    async handle(parts, ctx, config) {
      await handleResetCommand(parts, ctx, config);
    },
  },
  {
    name: 'verbosity',
    usage: '/codexify verbosity low|medium|high|off',
    needsMoreArgs: true,
    isAvailable: (config) => config.codex.enabled,
    async handle(parts, ctx, config) {
      await handleVerbosityCommand(parts[1], ctx, config);
    },
  },
  {
    name: 'reasoning-summary',
    usage: '/codexify reasoning-summary auto|concise|detailed|none|off',
    aliases: ['summary'],
    needsMoreArgs: true,
    isAvailable: (config) => config.codex.enabled,
    async handle(parts, ctx, config) {
      await handleReasoningSummaryCommand(parts[1], ctx, config);
    },
  },
  {
    name: 'service-tier',
    usage: '/codexify service-tier default|priority',
    needsMoreArgs: true,
    isAvailable: (config) => config.codex.enabled,
    async handle(parts, ctx, config) {
      await handleServiceTierCommand(parts[1], ctx, config);
    },
  },
];

const RESET_COMMAND_USAGE = 'Usage: /codexify reset use|details';

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

  switch (action) {
    case 'use': {
      await handleUseResetCreditCommand(ctx);
      return;
    }
    case 'details': {
      await handleResetCreditDetailsCommand(ctx);
      return;
    }
    default: {
      ctx.ui.notify(RESET_COMMAND_USAGE, 'warning');
    }
  }
}

async function handleVerbosityCommand(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  await handleCodexControlUpdate(value, ctx, config, {
    commandName: 'verbosity',
    usage: 'Usage: /codexify verbosity low|medium|high|off',
    label: 'Codex verbosity',
    configKey: 'verbosity',
    parse: parseCodexVerbosity,
    update: (codexConfig, parsedValue) => {
      codexConfig.verbosity = parsedValue === 'off' ? undefined : parsedValue;
    },
  });
}

async function handleReasoningSummaryCommand(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  await handleCodexControlUpdate(value, ctx, config, {
    commandName: 'reasoning-summary',
    usage: 'Usage: /codexify reasoning-summary auto|concise|detailed|none|off',
    label: 'Codex reasoning summary',
    configKey: 'reasoningSummary',
    parse: parseCodexReasoningSummary,
    update: (codexConfig, parsedValue) => {
      codexConfig.reasoningSummary = parsedValue === 'off' ? undefined : parsedValue;
    },
  });
}

async function handleServiceTierCommand(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  await handleCodexControlUpdate(value, ctx, config, {
    commandName: 'service-tier',
    usage: 'Usage: /codexify service-tier default|priority',
    label: 'Codex service tier',
    configKey: 'serviceTier',
    parse: parseCodexServiceTier,
    update: (codexConfig, parsedValue) => {
      codexConfig.serviceTier = parsedValue;
    },
  });
}

interface CodexControlUpdateOptions<TValue extends CodexControlValue> {
  commandName: string;
  usage: string;
  label: string;
  configKey: 'verbosity' | 'reasoningSummary' | 'serviceTier';
  parse(value: string): TValue | undefined;
  update(config: PiCodexifyConfig['codex'], parsedValue: TValue): void;
}

async function handleCodexControlUpdate<TValue extends CodexControlValue>(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  options: CodexControlUpdateOptions<TValue>
): Promise<void> {
  if (!config.codex.enabled) {
    ctx.ui.notify('codexify codex controls are disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  if (value === undefined) {
    ctx.ui.notify(buildCodexControlsStatusMessage(config.codex, ctx.model), 'info');
    return;
  }

  const parsedValue = options.parse(value);
  if (parsedValue === undefined) {
    ctx.ui.notify(options.usage, 'warning');
    return;
  }

  await updateCodexControlValue(ctx, config, parsedValue, options);
}

async function updateCodexControlValue<TValue extends CodexControlValue>(
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  parsedValue: TValue,
  options: CodexControlUpdateOptions<TValue>
): Promise<void> {
  try {
    const scope = resolveConfigScope(ctx.cwd, ctx.isProjectTrusted());
    await updateCodexControlConfig(ctx.cwd, scope, options.configKey, parsedValue);
    options.update(config.codex, parsedValue);
    ctx.ui.notify(buildConfigUpdateMessage(options.label, parsedValue, scope), 'info');
  } catch (error) {
    ctx.ui.notify(`codexify ${options.commandName} failed: ${getErrorMessage(error)}`, 'error');
  }
}

function buildStatusMessage(config: PiCodexifyConfig, ctx: ExtensionCommandContext): string {
  return ['pi-codexify', ...formatFeatureStatusLines(config), ...formatCodexControlStatusLines(config, ctx)].join('\n');
}

function formatFeatureStatusLines(config: PiCodexifyConfig): string[] {
  return [
    formatEnabledLine('codex controls', config.codex.enabled),
    formatEnabledLine('usage command', config.usage.enabled),
    formatEnabledLine('reset command', config.reset.enabled),
    formatEnabledLine('native web_search', config.webSearch.enabled),
  ];
}

function formatCodexControlStatusLines(config: PiCodexifyConfig, ctx: ExtensionCommandContext): string[] {
  if (!config.codex.enabled) return [];
  return ['', buildCodexControlsStatusMessage(config.codex, ctx.model)];
}

function formatEnabledLine(label: string, enabled: boolean): string {
  return `${label} enabled: ${enabled ? 'yes' : 'no'}`;
}

function buildUsageMessage(config: PiCodexifyConfig): string {
  const commandUsageLines = CODEXIFY_COMMANDS.filter((command) => command.isAvailable(config)).map(
    (command) => command.usage
  );

  return ['pi-codexify commands', ...commandUsageLines].join('\n');
}
