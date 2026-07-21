import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import {
  buildConfigUpdateMessage,
  resolveConfigScope,
  updateControlConfig,
  type ControlUpdate,
} from '#src/config/update.js';
import type { ControlsConfig, PiCodexifyConfig } from '#src/config/types.js';
import { buildControlsStatus } from '#src/control/status.js';
import { parseReasoningSummary, parseServiceTier, parseVerbosity } from '#src/control/values.js';
import { commandUsage } from '#src/command/definitions.js';

type ControlCommand = 'verbosity' | 'reasoning-summary' | 'service-tier';

type ControlDefinition = {
  label: string;
  parse(value: string): ControlUpdate | undefined;
};

const definitions: Record<ControlCommand, ControlDefinition> = {
  verbosity: {
    label: 'Codex verbosity',
    parse: (value) => {
      const parsed = parseVerbosity(value);
      return parsed === undefined ? undefined : { field: 'verbosity', value: parsed };
    },
  },
  'reasoning-summary': {
    label: 'Codex reasoning summary',
    parse: (value) => {
      const parsed = parseReasoningSummary(value);
      return parsed === undefined ? undefined : { field: 'reasoningSummary', value: parsed };
    },
  },
  'service-tier': {
    label: 'Codex service tier',
    parse: (value) => {
      const parsed = parseServiceTier(value);
      return parsed === undefined ? undefined : { field: 'serviceTier', value: parsed };
    },
  },
};

export async function handleControlCommand(
  command: ControlCommand,
  value: string | undefined,
  ctx: ExtensionCommandContext,
  config: PiCodexifyConfig
): Promise<void> {
  if (!config.controls.enabled) {
    ctx.ui.notify('codexify controls are disabled in pi-codexify.jsonc.', 'warning');
    return;
  }

  if (value === undefined) {
    ctx.ui.notify(buildControlsStatus(config.controls, ctx.model), 'info');
    return;
  }

  const definition = definitions[command];
  const update = definition.parse(value);
  if (update === undefined) {
    ctx.ui.notify(`Usage: ${commandUsage(command)}`, 'warning');
    return;
  }

  try {
    const scope = resolveConfigScope(ctx.cwd, ctx.isProjectTrusted());
    await updateControlConfig(ctx.cwd, scope, update);
    applyControlUpdate(config.controls, update);
    ctx.ui.notify(buildConfigUpdateMessage(definition.label, update.value, scope), 'info');
  } catch (error) {
    ctx.ui.notify(`codexify ${command} failed: ${getErrorMessage(error)}`, 'error');
  }
}

function applyControlUpdate(controls: ControlsConfig, update: ControlUpdate): void {
  switch (update.field) {
    case 'verbosity': {
      controls.verbosity = update.value === 'off' ? undefined : update.value;
      return;
    }
    case 'reasoningSummary': {
      controls.reasoningSummary = update.value === 'off' ? undefined : update.value;
      return;
    }
    case 'serviceTier': {
      controls.serviceTier = update.value;
    }
  }
}
