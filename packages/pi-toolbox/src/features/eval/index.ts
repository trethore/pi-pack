import { stat } from 'node:fs/promises';

import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';

import type { EvalToolConfig } from '#src/config/schema.js';
import {
  createEvalMetadata,
  createEvalParametersSchema,
  createRuntimeDescriptions,
  EVAL_TOOL_DEFINITION,
  getEnabledLanguages,
  type EvalParametersSchema,
} from '#src/features/eval/definition.js';
import { formatEvalCall, formatEvalResult } from '#src/features/eval/format.js';
import { prepareEvalParameters } from '#src/features/eval/parameters.js';
import { runEval } from '#src/features/eval/runner.js';
import { StreamingEvalOutput } from '#src/features/eval/streaming-output.js';
import { registerEvalToolResultError } from '#src/features/eval/tool-result-error.js';
import type { EvalToolDetails, EvalToolOptions } from '#src/features/eval/types.js';
import { createTextToolDefinition } from '#src/utils/tool-definition.js';

export function registerEvalTool(pi: ExtensionAPI, config: { eval: EvalToolConfig }): void {
  if (!config.eval.enabled || getEnabledLanguages(config.eval).length === 0) return;
  pi.registerTool(createEvalToolDefinition(config.eval));
  registerEvalToolResultError(pi, EVAL_TOOL_DEFINITION.name);
}

export function createEvalToolDefinition(
  config: EvalToolConfig,
  options: EvalToolOptions = {}
): ToolDefinition<EvalParametersSchema, EvalToolDetails> {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? runEval;
  const runtimeDescriptions = createRuntimeDescriptions(config);
  const metadata = createEvalMetadata(config, runtimeDescriptions);
  const parameters = createEvalParametersSchema(config, runtimeDescriptions);

  return createTextToolDefinition<EvalParametersSchema, EvalToolDetails>({
    metadata,
    parameters,
    async execute(_toolCallId, params, signal, onUpdate) {
      const preparedParams = prepareEvalParameters(params, config, cwd);
      await assertEvalCwd(preparedParams.cwd);
      const output = new StreamingEvalOutput(onUpdate);

      try {
        const result = await runner({
          cwd: preparedParams.cwd,
          language: preparedParams.language,
          code: preparedParams.code,
          runtime: preparedParams.runtime,
          timeoutMs: preparedParams.timeoutMs,
          inheritEnv: preparedParams.inheritEnv,
          signal,
          onOutput: (currentOutput) => output.update(currentOutput),
        });
        const formatted = await formatEvalResult(result, preparedParams.timeoutMs);

        return {
          content: [{ type: 'text', text: formatted.text }],
          details: {
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            durationMs: result.durationMs,
            truncation: formatted.truncation,
            fullOutputPath: formatted.fullOutputPath,
          },
        };
      } finally {
        output.close();
      }
    },
    formatCall: formatEvalCall,
  });
}

async function assertEvalCwd(cwd: string): Promise<void> {
  let stats;
  try {
    stats = await stat(cwd);
  } catch (error) {
    throw new Error(`eval failed: path does not exist: ${cwd}`, { cause: error });
  }

  if (!stats.isDirectory()) {
    throw new Error(`eval failed: path is not a directory: ${cwd}`);
  }
}
