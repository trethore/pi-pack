import type { ExtensionAPI, Theme, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { ApplyPatchToolConfig } from '#src/config/schema.js';
import { applyPatch, type ApplyPatchOptions, type ApplyPatchResult } from '#src/features/apply-patch/apply.js';
import { countApplyPatchSummary, formatApplyPatchSummary } from '#src/features/apply-patch/format.js';
import { formatPatchParseError, InvalidHunkError, InvalidPatchError } from '#src/features/apply-patch/parser.js';
import {
  cloneJsonSchema,
  createTextToolDefinition,
  formatToolCall,
  readJsonDefinition,
} from '#src/utils/tool-definition.js';

const APPLY_PATCH_TOOL_DEFINITION = readApplyPatchDefinition();

interface ApplyPatchParameters {
  patch: string;
  workdir?: string;
}

interface ApplyPatchDefinition {
  name: string;
  label: string;
  description: string | string[];
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: ApplyPatchParametersJsonSchema;
}

interface NormalizedApplyPatchDefinition extends Omit<ApplyPatchDefinition, 'description'> {
  description: string;
}

interface ApplyPatchParametersJsonSchema {
  type: 'object';
  additionalProperties: boolean;
  required: string[];
  properties: {
    patch: Record<string, unknown>;
    workdir: Record<string, unknown>;
  };
}

type ApplyPatchParametersSchema = ReturnType<typeof createApplyPatchParametersSchema>;
type ApplyPatchRunner = (options: ApplyPatchOptions) => Promise<ApplyPatchResult>;

export interface ApplyPatchToolDetails extends ApplyPatchResult {
  count: number;
}

export interface ApplyPatchToolOptions {
  cwd?: string;
  runner?: ApplyPatchRunner;
}

export function registerApplyPatchTool(pi: ExtensionAPI, config: { applyPatch: ApplyPatchToolConfig }): void {
  if (!config.applyPatch.enabled) return;
  pi.registerTool(createApplyPatchToolDefinition(config.applyPatch));
}

export function createApplyPatchToolDefinition(
  _config: ApplyPatchToolConfig,
  options: ApplyPatchToolOptions = {}
): ToolDefinition<ApplyPatchParametersSchema, ApplyPatchToolDetails | undefined> {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? applyPatch;
  const parameters = createApplyPatchParametersSchema();

  return createTextToolDefinition<ApplyPatchParametersSchema, ApplyPatchToolDetails | undefined>({
    metadata: APPLY_PATCH_TOOL_DEFINITION,
    parameters,
    async execute(_toolCallId, params) {
      try {
        const result = await runner({ cwd, patch: params.patch, workdir: normalizeWorkdir(params.workdir) });
        return {
          content: [
            {
              type: 'text',
              text: formatApplyPatchSummary(result),
            },
          ],
          details: {
            ...result,
            count: countApplyPatchSummary(result),
          },
        };
      } catch (error) {
        throw new Error(`apply_patch failed: ${formatApplyPatchError(error)}`, { cause: error });
      }
    },
    formatCall: formatApplyPatchCall,
  });
}

function readApplyPatchDefinition(): NormalizedApplyPatchDefinition {
  const definition = readJsonDefinition<ApplyPatchDefinition>(new URL('apply-patch-definition.json', import.meta.url));
  return {
    ...definition,
    description: Array.isArray(definition.description) ? definition.description.join('\n') : definition.description,
  };
}

function createApplyPatchParametersSchema() {
  return Type.Unsafe<ApplyPatchParameters>(cloneJsonSchema(APPLY_PATCH_TOOL_DEFINITION.parameters));
}

function normalizeWorkdir(workdir: string | undefined): string | undefined {
  const trimmed = workdir?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function formatApplyPatchCall(args: ApplyPatchParameters | undefined, theme: Theme): string {
  return formatToolCall(theme, {
    toolName: APPLY_PATCH_TOOL_DEFINITION.name,
    query: formatPatchLabel(args?.patch),
    paths: normalizeWorkdir(args?.workdir) ?? '.',
    flags: '',
  });
}

function formatPatchLabel(patch: string | undefined): string {
  if (patch === undefined || patch.trim().length === 0) return '...';
  const firstHunkLine = patch
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        line.startsWith('*** Add File:') || line.startsWith('*** Delete File:') || line.startsWith('*** Update File:')
    );
  return firstHunkLine ?? 'patch';
}

function formatApplyPatchError(error: unknown): string {
  if (error instanceof InvalidPatchError || error instanceof InvalidHunkError) return formatPatchParseError(error);
  return error instanceof Error ? error.message : String(error);
}
