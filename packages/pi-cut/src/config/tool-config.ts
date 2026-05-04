import type { PiCutConfig, ResolvedToolConfig } from '#src/config/schema.js';

export function resolveToolConfig(config: PiCutConfig, toolName: string): ResolvedToolConfig {
  const resolvedConfig: ResolvedToolConfig = {
    enabled: config.enabled,
    terminalCleanup: { ...config.terminalCleanup },
    repetitionFolding: { ...config.repetitionFolding },
    lineTruncation: { ...config.lineTruncation },
  };

  applyDefaultToolBehavior(resolvedConfig, toolName);

  for (const override of config.tools) {
    if (!matchesToolSelector(override.selector, toolName)) continue;

    applyBooleanOverride(override.enabled, (value) => {
      resolvedConfig.enabled = value;
    });
    applyStrategyOverride(resolvedConfig.terminalCleanup, override.terminalCleanup);
    applyStrategyOverride(resolvedConfig.repetitionFolding, override.repetitionFolding);
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
