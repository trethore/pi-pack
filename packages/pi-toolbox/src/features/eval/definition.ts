import { spawnSync } from 'node:child_process';

import { Type } from 'typebox';

import type { EvalToolConfig, RuntimeConfig } from '#src/config/schema.js';
import type { EvalLanguage } from '#src/features/eval/runner.js';
import type {
  EvalDefinition,
  EvalParameters,
  EvalParametersJsonSchema,
} from '#src/features/eval/types.js';
import { cloneJsonSchema, readJsonDefinition } from '#src/utils/tool-definition.js';

export const EVAL_TOOL_DEFINITION = readEvalDefinition();

export type EvalParametersSchema = ReturnType<typeof createEvalParametersSchema>;

export function createEvalMetadata(
  config: EvalToolConfig,
  runtimeDescriptions: string[]
): Omit<EvalDefinition, 'parameters'> {
  return {
    name: EVAL_TOOL_DEFINITION.name,
    label: EVAL_TOOL_DEFINITION.label,
    description: replaceDefinitionPlaceholders(
      EVAL_TOOL_DEFINITION.description,
      config,
      runtimeDescriptions
    ),
    promptSnippet: EVAL_TOOL_DEFINITION.promptSnippet,
    promptGuidelines: EVAL_TOOL_DEFINITION.promptGuidelines,
  };
}

export function createEvalParametersSchema(config: EvalToolConfig, runtimeDescriptions: string[]) {
  const parameters = cloneParametersSchema(EVAL_TOOL_DEFINITION.parameters);
  parameters.properties.language.enum = getEnabledLanguages(config);
  parameters.properties.language.description = replaceDefinitionPlaceholders(
    parameters.properties.language.description,
    config,
    runtimeDescriptions
  );
  parameters.properties.timeoutMs.description = replaceDefinitionPlaceholders(
    parameters.properties.timeoutMs.description,
    config,
    runtimeDescriptions
  );
  if (config.maxTimeoutMs !== undefined) {
    parameters.properties.timeoutMs.maximum = config.maxTimeoutMs;
  }
  return Type.Unsafe<EvalParameters>(parameters);
}

export function createRuntimeDescriptions(config: EvalToolConfig): string[] {
  return getEnabledLanguages(config).map((language) => {
    const runtime = config[language];
    const version = detectRuntimeVersion(runtime);
    return `${language}: ${runtime.command}${formatArgs(runtime.args)}${version ? ` ${version}` : ' version unavailable'}`;
  });
}

export function getEnabledLanguages(config: EvalToolConfig): EvalLanguage[] {
  return (['node', 'python'] as const).filter((language) => config[language].enabled);
}

function readEvalDefinition(): EvalDefinition {
  return readJsonDefinition(new URL('eval-definition.json', import.meta.url));
}

function cloneParametersSchema(parameters: EvalParametersJsonSchema): EvalParametersJsonSchema {
  return cloneJsonSchema(parameters);
}

function replaceDefinitionPlaceholders(
  value: string,
  config: EvalToolConfig,
  runtimeDescriptions: string[]
): string {
  return value
    .replaceAll('{{availableLanguages}}', formatRuntimeDescriptions(runtimeDescriptions))
    .replaceAll('{{defaultTimeoutMs}}', String(config.defaultTimeoutMs))
    .replaceAll('{{maxTimeoutDescription}}', formatMaxTimeoutDescription(config.maxTimeoutMs));
}

function formatRuntimeDescriptions(runtimeDescriptions: string[]): string {
  return runtimeDescriptions.length === 0 ? 'none' : runtimeDescriptions.join('; ');
}

function formatMaxTimeoutDescription(maxTimeoutMs: number | undefined): string {
  return maxTimeoutMs === undefined ? '' : ` Maximum timeout: ${maxTimeoutMs}ms.`;
}

function formatArgs(args: string[]): string {
  return args.length === 0 ? '' : ` ${args.join(' ')}`;
}

function detectRuntimeVersion(runtime: RuntimeConfig): string | undefined {
  const result = spawnSync(runtime.command, [...runtime.args, '--version'], {
    encoding: 'utf8',
    timeout: 2000,
    windowsHide: true,
  });
  const output = `${result.stdout}${result.stderr}`.trim();
  return result.error || output.length === 0 ? undefined : output;
}
