import path from 'node:path';

import type { EvalToolConfig } from '#src/config/schema.js';
import type { EvalParameters, PreparedEvalParameters } from '#src/features/eval/types.js';

export function prepareEvalParameters(
  params: EvalParameters,
  config: EvalToolConfig,
  baseCwd: string
): PreparedEvalParameters {
  const runtime = config[params.language];
  if (runtime === undefined || !runtime.enabled) {
    throw new Error(`eval failed: language is disabled or unavailable: ${params.language}`);
  }

  return {
    language: params.language,
    code: params.code,
    timeoutMs: resolveTimeoutMs(params.timeoutMs, config),
    cwd: resolveCwd(params.path, baseCwd),
    runtime,
    inheritEnv: params.inheritEnv ?? false,
  };
}

function resolveCwd(evalPath: string | undefined, baseCwd: string): string {
  return path.resolve(baseCwd, evalPath ?? '.');
}

function resolveTimeoutMs(timeoutMs: number | undefined, config: EvalToolConfig): number {
  const resolvedTimeoutMs = timeoutMs ?? config.defaultTimeoutMs;
  return config.maxTimeoutMs === undefined
    ? resolvedTimeoutMs
    : Math.min(resolvedTimeoutMs, config.maxTimeoutMs);
}
