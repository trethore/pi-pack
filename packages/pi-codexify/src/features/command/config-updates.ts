import { existsSync } from 'node:fs';

import { updateJsoncFile } from '@trethore/pi-shared/config/write-jsonc.js';
import { GLOBAL_CONFIG_PATH, getProjectConfigPath } from '#src/config/locations.js';
import type { CodexReasoningSummary, CodexServiceTier, CodexVerbosity } from '#src/config/schema.js';

export type ConfigScope = 'global' | 'project';
export type CodexControlField = 'verbosity' | 'reasoningSummary' | 'serviceTier';
export type CodexControlValue = CodexVerbosity | CodexReasoningSummary | CodexServiceTier | 'off';

export async function updateCodexControlConfig(
  cwd: string,
  scope: ConfigScope,
  field: CodexControlField,
  value: CodexControlValue
): Promise<void> {
  await updateJsoncFile(
    getConfigPathForScope(cwd, scope),
    [
      {
        path: ['codex', field],
        value: getStoredCodexControlValue(scope, value),
      },
    ],
    [['codex']]
  );
}

export function resolveConfigScope(cwd: string, isProjectTrusted: boolean): ConfigScope {
  return isProjectTrusted && existsSync(getProjectConfigPath(cwd)) ? 'project' : 'global';
}

export function buildConfigUpdateMessage(
  label: string,
  value: CodexControlValue | 'on' | 'off',
  scope: ConfigScope
): string {
  const scopeLabel = scope === 'project' ? 'project config' : 'global config';
  const displayedValue = value === 'off' ? 'off' : value;
  return `${label} set to ${displayedValue} in ${scopeLabel}.`;
}

function getStoredCodexControlValue(scope: ConfigScope, value: CodexControlValue): unknown {
  if (value !== 'off') return value;

  return scope === 'project' ? null : undefined;
}

function getConfigPathForScope(cwd: string, scope: ConfigScope): string {
  return scope === 'project' ? getProjectConfigPath(cwd) : GLOBAL_CONFIG_PATH;
}
