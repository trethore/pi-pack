import { existsSync } from 'node:fs';

import { updateJsoncFile } from '@trethore/pi-shared/config/write-jsonc.js';
import { GLOBAL_CONFIG_PATH, PROJECT_CONFIG_PATH } from '#src/config/locations.js';
import type { CodexReasoningSummary, CodexVerbosity } from '#src/config/schema.js';

export type ConfigScope = 'global' | 'project';
export type CodexControlField = 'verbosity' | 'reasoningSummary';
export type CodexControlValue = CodexVerbosity | CodexReasoningSummary | 'off';

export async function updateCodexControlConfig(
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

export function resolveConfigScope(): ConfigScope {
  return existsSync(PROJECT_CONFIG_PATH) ? 'project' : 'global';
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

function getConfigPathForScope(scope: ConfigScope): string {
  return scope === 'project' ? PROJECT_CONFIG_PATH : GLOBAL_CONFIG_PATH;
}
