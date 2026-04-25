import type { ExtensionAPI, ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import { loadConfig } from '#src/config/config.js';
import type { PiCodexifyConfig } from '#src/config/schema.js';
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
    handleVerbosityCommand(parts[1], ctx, config, codexControls);
    return;
  }

  if (parts[0] === 'reasoning-summary' || parts[0] === 'summary') {
    handleReasoningSummaryCommand(parts[1], ctx, config, codexControls);
    return;
  }

  ctx.ui.notify(buildUsageMessage(config), 'warning');
}

async function handleUsageCommand(
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  if (!config.usage.enabled) {
    ctx.ui.notify('codexify usage is disabled in codexify.jsonc.', 'warning');
    return;
  }

  await notifyCodexUsage(ctx);
}

function handleVerbosityCommand(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController
) {
  if (!config.codex.enabled) {
    ctx.ui.notify('codexify codex controls are disabled in codexify.jsonc.', 'warning');
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

  codexControls.updateVerbosity(parsedValue === 'off' ? undefined : parsedValue);
  ctx.ui.notify(`Codex verbosity set to ${parsedValue} for this session.`, 'info');
}

function handleReasoningSummaryCommand(
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig,
  codexControls: CodexControlsController
) {
  if (!config.codex.enabled) {
    ctx.ui.notify('codexify codex controls are disabled in codexify.jsonc.', 'warning');
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

  codexControls.updateReasoningSummary(parsedValue === 'off' ? undefined : parsedValue);
  ctx.ui.notify(`Codex reasoning summary set to ${parsedValue} for this session.`, 'info');
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

function splitArgs(args: string): string[] {
  const trimmed = args.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}
