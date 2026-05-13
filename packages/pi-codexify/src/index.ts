import { existsSync } from 'node:fs';

import type { ExtensionAPI, ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import type { AutocompleteItem } from '@mariozechner/pi-tui';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';
import {
  registerEnabledFeaturesWithContext,
  type ContextualExtensionFeature,
} from '@trethore/pi-shared/features/registry.js';
import { loadConfig } from '#src/config/config.js';
import { GLOBAL_CONFIG_PATH, PROJECT_CONFIG_PATH } from '#src/config/locations.js';
import type {
  CodexReasoningSummary,
  CodexVerbosity,
  PiCodexifyConfig,
} from '#src/config/schema.js';
import { updateJsoncFile } from '@trethore/pi-shared/config/write-jsonc.js';
import {
  codexAccountActions,
  handleCodexAccountCommand,
  parseCodexAccountAction,
  registerCodexAccountSync,
} from '#src/features/accounts/index.js';
import {
  buildCodexControlsStatusMessage,
  type CodexControlsController,
  parseCodexReasoningSummary,
  parseCodexVerbosity,
  registerCodexControls,
} from '#src/features/codex-controls/index.js';
import { notifyCodexUsage } from '#src/features/usage/index.js';
import { registerWebSearch } from '#src/features/web-search/index.js';

interface CodexifyRuntime {
  codexControls?: CodexControlsController;
}

const FEATURES: readonly ContextualExtensionFeature<PiCodexifyConfig, CodexifyRuntime>[] = [
  {
    isEnabled: (config) => config.enabled && config.codex.enabled,
    register(pi, config, runtime) {
      runtime.codexControls = registerCodexControls(pi, config.codex);
    },
  },
  {
    isEnabled: (config) => config.enabled && config.webSearch.enabled,
    register(pi, config) {
      registerWebSearch(pi, config.webSearch);
    },
  },
  {
    isEnabled: (config) => config.enabled,
    register(pi) {
      registerCodexAccountSync(pi);
    },
  },
  {
    isEnabled: (config) => config.enabled,
    register(pi, config, runtime) {
      registerCodexifyCommand(pi, config, runtime.codexControls);
    },
  },
];

export default function piCodexify(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());
  const runtime: CodexifyRuntime = {};

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerEnabledFeaturesWithContext(pi, loadedConfig.config, FEATURES, runtime);
}

function registerCodexifyCommand(
  pi: ExtensionAPI,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController | undefined
) {
  pi.registerCommand('codexify', {
    description: 'Control Codex payload options and inspect Codex usage',
    getArgumentCompletions: (prefix) => getCodexifyArgumentCompletions(prefix, config),
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
    isAvailable: () => true,
    async handle(parts, ctx) {
      await handleCodexAccountCommand(parts, ctx);
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
  return CODEXIFY_COMMANDS.find(
    (command) => command.name === commandName || command.aliases?.includes(commandName)
  );
}

async function handleUsageCommand(
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  if (!config.usage.enabled) {
    ctx.ui.notify('codexify usage is disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  await notifyCodexUsage(ctx);
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
    `web_search tool enabled: ${config.webSearch.enabled ? 'yes' : 'no'}`,
  ];

  if (config.codex.enabled) {
    const controls = getCodexControls(codexControls);
    lines.push('', buildCodexControlsStatusMessage(controls.getConfig(), ctx.model));
  }

  return lines.join('\n');
}

function getCodexControls(
  codexControls: CodexControlsController | undefined
): CodexControlsController {
  if (codexControls) return codexControls;
  throw new Error('codex controls are not registered');
}

function buildUsageMessage(config: PiCodexifyConfig): string {
  const commandUsageLines = CODEXIFY_COMMANDS.filter((command) => command.isAvailable(config)).map(
    (command) => command.usage
  );

  return ['pi-codexify commands', ...commandUsageLines].join('\n');
}

type ConfigScope = 'global' | 'project';
type CodexControlField = 'verbosity' | 'reasoningSummary';
type CodexControlValue = CodexVerbosity | CodexReasoningSummary | 'off';

async function updateCodexControlConfig(
  scope: ConfigScope,
  field: CodexControlField,
  value: CodexControlValue
): Promise<void> {
  await updateJsoncFile(
    getConfigPathForScope(scope),
    [
      {
        path: ['codex', field],
        value: getStoredCodexControlValue(scope, value),
      },
    ],
    [['codex']]
  );
}

function getStoredCodexControlValue(scope: ConfigScope, value: CodexControlValue): unknown {
  if (value !== 'off') return value;

  return scope === 'project' ? null : undefined;
}

function resolveConfigScope(): ConfigScope {
  return existsSync(PROJECT_CONFIG_PATH) ? 'project' : 'global';
}

function getConfigPathForScope(scope: ConfigScope): string {
  return scope === 'project' ? PROJECT_CONFIG_PATH : GLOBAL_CONFIG_PATH;
}

function buildConfigUpdateMessage(
  label: string,
  value: CodexControlValue,
  scope: ConfigScope
): string {
  const scopeLabel = scope === 'project' ? 'project config' : 'global config';
  const displayedValue = value === 'off' ? 'off' : value;
  return `${label} set to ${displayedValue} in ${scopeLabel}.`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getCodexifyArgumentCompletions(
  prefix: string,
  config: PiCodexifyConfig
): AutocompleteItem[] | null {
  const state = parseCompletionState(prefix);

  if (state.path.length === 0) {
    return buildCompletionItems(state, getRootCompletionCandidates(config));
  }

  if (state.path.length === 1 && state.path[0] === 'verbosity' && config.codex.enabled) {
    return buildCompletionItems(state, ['low', 'medium', 'high', 'off']);
  }

  if (state.path.length === 1 && isReasoningSummaryCommand(state.path[0]) && config.codex.enabled) {
    return buildCompletionItems(state, ['auto', 'concise', 'detailed', 'off']);
  }

  if (state.path.length === 1 && state.path[0] === 'account') {
    return buildCompletionItems(state, codexAccountActions);
  }

  return null;
}

function getRootCompletionCandidates(config: PiCodexifyConfig): string[] {
  return CODEXIFY_COMMANDS.filter((command) => command.isAvailable(config)).map(
    (command) => command.name
  );
}

type CompletionState = {
  path: string[];
  currentToken: string;
};

function parseCompletionState(prefix: string): CompletionState {
  const hasTrailingWhitespace = /\s$/.test(prefix);
  const parts = splitArgs(prefix);

  if (hasTrailingWhitespace) {
    return {
      path: parts,
      currentToken: '',
    };
  }

  return {
    path: parts.slice(0, -1),
    currentToken: parts.at(-1) ?? '',
  };
}

function buildCompletionItems(
  state: CompletionState,
  candidates: readonly string[]
): AutocompleteItem[] | null {
  const items = candidates
    .filter((candidate) => candidate.startsWith(state.currentToken))
    .map((candidate) => ({
      value: [...state.path, formatCompletionToken(candidate)].join(' '),
      label: candidate,
    }));

  return items.length > 0 ? items : null;
}

function formatCompletionToken(candidate: string): string {
  return candidateNeedsMoreArgs(candidate) ? `${candidate} ` : candidate;
}

function candidateNeedsMoreArgs(candidate: string): boolean {
  return (
    findCodexifyCommand(candidate)?.needsMoreArgs === true ||
    parseCodexAccountAction(candidate) != null
  );
}

function isReasoningSummaryCommand(command: string): boolean {
  return findCodexifyCommand(command)?.name === 'reasoning-summary';
}

function splitArgs(args: string): string[] {
  const trimmed = args.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}
