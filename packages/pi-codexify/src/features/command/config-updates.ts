import { existsSync } from 'node:fs';

import { updateJsoncFile } from '@trethore/pi-shared/config/write-jsonc.js';
import { GLOBAL_CONFIG_PATH, PROJECT_CONFIG_PATH } from '#src/config/locations.js';
import type { CodexReasoningSummary, CodexVerbosity, OpenAICompactionReasoning } from '#src/config/schema.js';

export type ConfigScope = 'global' | 'project';
export type CodexControlField = 'verbosity' | 'reasoningSummary';
export type CodexControlValue = CodexVerbosity | CodexReasoningSummary | 'off';
export type OpenAICompactionField = 'enabled' | 'model' | 'reasoning';
export type OpenAICompactionValue = boolean | string | OpenAICompactionReasoning;

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

export async function updateOpenAICompactionConfig(
  scope: ConfigScope,
  field: OpenAICompactionField,
  value: OpenAICompactionValue
): Promise<void> {
  await updateJsoncFile(
    getConfigPathForScope(scope),
    [
      {
        path: ['openaiCompaction', field],
        value,
      },
    ],
    [['openaiCompaction']]
  );
}

export function resolveConfigScope(): ConfigScope {
  return existsSync(PROJECT_CONFIG_PATH) ? 'project' : 'global';
}

export function buildConfigUpdateMessage(
  label: string,
  value: CodexControlValue | OpenAICompactionValue | 'on' | 'off',
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
