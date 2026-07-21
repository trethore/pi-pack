import { existsSync } from 'node:fs';

import { updateJsoncFile } from '@trethore/pi-shared/config/write-jsonc.js';
import { GLOBAL_CONFIG_PATH, getProjectConfigPath } from '#src/config/paths.js';
import type { CodexReasoningSummary, CodexServiceTier, CodexVerbosity } from '#src/config/types.js';

export type ConfigScope = 'global' | 'project';
export type ControlValue = CodexVerbosity | CodexReasoningSummary | CodexServiceTier | 'off';
export type ControlUpdate =
  | { field: 'verbosity'; value: CodexVerbosity | 'off' }
  | { field: 'reasoningSummary'; value: CodexReasoningSummary | 'off' }
  | { field: 'serviceTier'; value: CodexServiceTier };

export async function updateControlConfig(cwd: string, scope: ConfigScope, update: ControlUpdate): Promise<void> {
  await updateJsoncFile(
    scope === 'project' ? getProjectConfigPath(cwd) : GLOBAL_CONFIG_PATH,
    [{ path: ['controls', update.field], value: storedValue(scope, update.value) }],
    [['controls']]
  );
}

export function resolveConfigScope(cwd: string, projectTrusted: boolean): ConfigScope {
  return projectTrusted && existsSync(getProjectConfigPath(cwd)) ? 'project' : 'global';
}

export function buildConfigUpdateMessage(label: string, value: ControlValue, scope: ConfigScope): string {
  return `${label} set to ${value} in ${scope} config.`;
}

function storedValue(scope: ConfigScope, value: ControlValue): unknown {
  if (value !== 'off') return value;
  return scope === 'project' ? null : undefined;
}
