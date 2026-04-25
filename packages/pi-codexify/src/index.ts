import { existsSync } from 'node:fs';

import type { ExtensionAPI, ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import type { AutocompleteItem } from '@mariozechner/pi-tui';
import { loadConfig } from '#src/config/config.js';
import { GLOBAL_CONFIG_PATH, PROJECT_CONFIG_PATH } from '#src/config/locations.js';
import type {
  CodexReasoningSummary,
  CodexVerbosity,
  PiCodexifyConfig,
} from '#src/config/schema.js';
import { updateJsoncFile } from '#src/config/write-jsonc.js';
import {
  buildCodexControlsStatusMessage,
  type CodexControlsController,
  parseCodexReasoningSummary,
  parseCodexVerbosity,
  registerCodexControls,
} from '#src/features/codex-controls/index.js';
import { notifyCodexUsage } from '#src/features/usage/index.js';

export default function piCodexify(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);

  if (!loadedConfig.config.enabled) return;

  const codexControls = registerCodexControls(pi, loadedConfig.config.codex);
  registerCodexifyCommand(pi, loadedConfig.config, codexControls);
}

function registerConfigDiagnostics(pi: ExtensionAPI, errors: string[]) {
  if (errors.length === 0) return;

  pi.on('session_start', (_event, ctx) => {
    for (const error of errors) {
      ctx.ui.notify(error, 'warning');
    }
  });
}

function registerCodexifyCommand(
  pi: ExtensionAPI,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController
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
  codexControls: CodexControlsController
): Promise<void> {
  const parts = splitArgs(args);

  if (parts.length === 0 || parts[0] === 'help') {
    ctx.ui.notify(buildUsageMessage(config), 'info');
    return;
  }

  if (parts[0] === 'status') {
    ctx.ui.notify(buildStatusMessage(config, ctx, codexControls), 'info');
    return;
  }

  if (parts[0] === 'usage') {
    await handleUsageCommand(ctx, config);
    return;
  }

  if (parts[0] === 'verbosity') {
    await handleVerbosityCommand(parts[1], ctx, config, codexControls);
    return;
  }

  if (parts[0] === 'reasoning-summary' || parts[0] === 'summary') {
    await handleReasoningSummaryCommand(parts[1], ctx, config, codexControls);
    return;
  }

  ctx.ui.notify(buildUsageMessage(config), 'warning');
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
  codexControls: CodexControlsController
): Promise<void> {
  if (!config.codex.enabled) {
    ctx.ui.notify('codexify codex controls are disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  if (value === undefined) {
    ctx.ui.notify(buildCodexControlsStatusMessage(codexControls.getConfig(), ctx.model), 'info');
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
    codexControls.updateVerbosity(parsedValue === 'off' ? undefined : parsedValue);
    ctx.ui.notify(buildConfigUpdateMessage('Codex verbosity', parsedValue, scope), 'info');
  } catch (error) {
    ctx.ui.notify(`codexify verbosity failed: ${getErrorMessage(error)}`, 'error');
  }
}

async function handleReasoningSummaryCommand(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController
): Promise<void> {
  if (!config.codex.enabled) {
    ctx.ui.notify('codexify codex controls are disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  if (value === undefined) {
    ctx.ui.notify(buildCodexControlsStatusMessage(codexControls.getConfig(), ctx.model), 'info');
    return;
  }

  const parsedValue = parseCodexReasoningSummary(value);
  if (parsedValue === undefined) {
    ctx.ui.notify('Usage: /codexify reasoning-summary auto|concise|detailed|none|off', 'warning');
    return;
  }

  try {
    const scope = resolveConfigScope();
    await updateCodexControlConfig(scope, 'reasoningSummary', parsedValue);
    codexControls.updateReasoningSummary(parsedValue === 'off' ? undefined : parsedValue);
    ctx.ui.notify(buildConfigUpdateMessage('Codex reasoning summary', parsedValue, scope), 'info');
  } catch (error) {
    ctx.ui.notify(`codexify reasoning-summary failed: ${getErrorMessage(error)}`, 'error');
  }
}

function buildStatusMessage(
  config: PiCodexifyConfig,
  ctx: ExtensionCommandContext,
  codexControls: CodexControlsController
): string {
  const lines = [
    'pi-codexify',
    `codex controls enabled: ${config.codex.enabled ? 'yes' : 'no'}`,
    `usage command enabled: ${config.usage.enabled ? 'yes' : 'no'}`,
  ];

  if (config.codex.enabled) {
    lines.push('', buildCodexControlsStatusMessage(codexControls.getConfig(), ctx.model));
  }

  return lines.join('\n');
}

function buildUsageMessage(config: PiCodexifyConfig): string {
  const lines = ['pi-codexify commands', '/codexify help', '/codexify status'];

  if (config.usage.enabled) {
    lines.push('/codexify usage');
  }

  if (config.codex.enabled) {
    lines.push(
      '/codexify verbosity low|medium|high|off',
      '/codexify reasoning-summary auto|concise|detailed|none|off'
    );
  }

  return lines.join('\n');
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
    return buildCompletionItems(state, ['auto', 'concise', 'detailed', 'none', 'off']);
  }

  return null;
}

function getRootCompletionCandidates(config: PiCodexifyConfig): string[] {
  const candidates = ['help', 'status'];

  if (config.usage.enabled) {
    candidates.push('usage');
  }

  if (config.codex.enabled) {
    candidates.push('verbosity', 'reasoning-summary');
  }

  return candidates;
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
  return candidate === 'verbosity' || candidate === 'reasoning-summary';
}

function isReasoningSummaryCommand(command: string): boolean {
  return command === 'reasoning-summary' || command === 'summary';
}

function splitArgs(args: string): string[] {
  const trimmed = args.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}
