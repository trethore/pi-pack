import { readFileSync } from 'node:fs';

import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { ExecuteCodeConfig } from '#src/config/schema.js';
import { executeCode } from '#src/core/execute-code-runner.js';
import type { ExecuteCodeOutputDetails } from '#src/core/output.js';

const EXECUTE_CODE_DEFINITION = readExecuteCodeDefinition();

interface ExecuteCodeParameters {
  packages?: string[];
  code: string;
  timeout?: number;
}

interface ExecuteCodeDefinition {
  name: string;
  label: string;
  description: string | string[];
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: ExecuteCodeParametersJsonSchema;
}

interface ExecuteCodeParametersJsonSchema {
  type: 'object';
  additionalProperties: boolean;
  required: string[];
  properties: {
    packages: Record<string, unknown>;
    code: Record<string, unknown>;
    timeout: { description: string } & Record<string, unknown>;
  };
}

type ExecuteCodeParametersSchema = ReturnType<typeof createExecuteCodeParametersSchema>;

export interface ExecuteCodeToolOptions {
  cwd?: string;
}

export function registerExecuteCodeTool(pi: ExtensionAPI, config: { executeCode: ExecuteCodeConfig }): void {
  if (!config.executeCode.enabled) return;
  pi.registerTool(createExecuteCodeToolDefinition(config.executeCode));
}

export function createExecuteCodeToolDefinition(
  config: ExecuteCodeConfig,
  options: ExecuteCodeToolOptions = {}
): ToolDefinition<ExecuteCodeParametersSchema, ExecuteCodeOutputDetails | undefined> {
  const cwd = options.cwd ?? process.cwd();
  const parameters = createExecuteCodeParametersSchema(config);

  return {
    name: EXECUTE_CODE_DEFINITION.name,
    label: EXECUTE_CODE_DEFINITION.label,
    description: formatDescription(EXECUTE_CODE_DEFINITION.description),
    promptSnippet: EXECUTE_CODE_DEFINITION.promptSnippet,
    promptGuidelines: EXECUTE_CODE_DEFINITION.promptGuidelines,
    parameters,
    async execute(_toolCallId, params, signal) {
      const result = await executeCode({
        code: params.code,
        packages: params.packages,
        timeoutSeconds: params.timeout ?? config.defaultTimeoutSeconds,
        packageCachePath: config.packageCachePath,
        cwd,
        signal,
      });

      return {
        content: [{ type: 'text', text: result.text }],
        details: result.details,
      };
    },
  };
}

function readExecuteCodeDefinition(): ExecuteCodeDefinition {
  return JSON.parse(
    readFileSync(new URL('execute-code-definition.json', import.meta.url), 'utf8')
  ) as ExecuteCodeDefinition;
}

function createExecuteCodeParametersSchema(config: ExecuteCodeConfig) {
  const parameters = structuredClone(EXECUTE_CODE_DEFINITION.parameters);
  parameters.properties.timeout.description = parameters.properties.timeout.description.replace(
    '{{defaultTimeout}}',
    String(config.defaultTimeoutSeconds)
  );
  return Type.Unsafe<ExecuteCodeParameters>(parameters);
}

function formatDescription(description: string | string[]): string {
  const text = Array.isArray(description) ? description.join('\n') : description;
  return text.replace('{{programmaticToolsDefinitions}}', '');
}
