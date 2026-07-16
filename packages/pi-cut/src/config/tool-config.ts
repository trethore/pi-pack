import type { PiCutConfig, ResolvedToolConfig } from '#src/config/schema.js';

export function resolveToolConfig(config: PiCutConfig, toolName: string): ResolvedToolConfig {
  const resolvedConfig: ResolvedToolConfig = {
    enabled: config.enabled,
    transformErrors: config.transformErrors,
    terminalCleanup: { ...config.terminalCleanup },
    repetitionFolding: { ...config.repetitionFolding },
    newLinesFolding: { ...config.newLinesFolding },
    lineTruncation: { ...config.lineTruncation },
  };

  applyDefaultToolBehavior(resolvedConfig, toolName);

  for (const override of config.tools) {
    if (!matchesToolSelector(override.selector, toolName)) continue;

    applyBooleanOverride(override.enabled, (value) => {
      resolvedConfig.enabled = value;
    });
    applyBooleanOverride(override.transformErrors, (value) => {
      resolvedConfig.transformErrors = value;
    });
    applyStrategyOverride(resolvedConfig.terminalCleanup, override.terminalCleanup);
    applyStrategyOverride(resolvedConfig.repetitionFolding, override.repetitionFolding);
    applyNewLinesFoldingOverride(resolvedConfig.newLinesFolding, override.newLinesFolding);
    applyStrategyOverride(resolvedConfig.lineTruncation, override.lineTruncation);
  }

  return resolvedConfig;
}

function applyDefaultToolBehavior(config: ResolvedToolConfig, toolName: string) {
  if (toolName !== 'bash') {
    config.terminalCleanup.enabled = false;
  }

  if (toolName === 'edit' || toolName === 'write') {
    config.repetitionFolding.enabled = false;
    config.newLinesFolding.enabled = false;
    config.lineTruncation.enabled = false;
  }
}

function matchesToolSelector(selector: RegExp, toolName: string): boolean {
  selector.lastIndex = 0;
  return selector.test(toolName);
}

function applyBooleanOverride(value: boolean | undefined, apply: (value: boolean) => void) {
  if (value !== undefined) apply(value);
}

function applyStrategyOverride<T extends object>(target: T, source: Partial<T> | undefined) {
  if (!source) return;
  Object.assign(target, source);
}

function applyNewLinesFoldingOverride(
  target: ResolvedToolConfig['newLinesFolding'],
  source: Partial<ResolvedToolConfig['newLinesFolding']> | undefined
) {
  if (!source) return;

  const nextConfig = { ...target, ...source };
  if (nextConfig.foldTo > nextConfig.minNewLines) return;

  Object.assign(target, source);
}
