import type { ExtensionAPI, Theme, ToolDefinition, ToolRenderResultOptions } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { type Static, Type } from 'typebox';

import {
  ApplyPatchFailure,
  applyPatch,
  type ApplyPatchOptions,
  type ApplyPatchResult,
} from '#src/features/apply-patch/apply.js';
import {
  countApplyPatchSummary,
  formatApplyPatchFailure,
  formatApplyPatchSummary,
} from '#src/features/apply-patch/format.js';
import { formatPatchParseError, InvalidHunkError, InvalidPatchError } from '#src/features/apply-patch/parser.js';
import { APPLY_PATCH_PROMPT } from '#src/prompts.js';
import { normalizeToolPath } from '#src/utils/paths.js';
import { createTextToolDefinition, formatToolCall } from '#src/utils/tool-definition.js';
import { formatTextToolResult } from '#src/utils/tool-results.js';

const TOOL_NAME = 'apply_patch';

const APPLY_PATCH_TOOL_DEFINITION = {
  name: TOOL_NAME,
  label: TOOL_NAME,
  ...APPLY_PATCH_PROMPT.tool,
};

const APPLY_PATCH_PARAMETERS = Type.Object(
  {
    patch: Type.String({ description: APPLY_PATCH_PROMPT.parameters.patch }),
    workdir: Type.Union([Type.String(), Type.Null()], {
      description: APPLY_PATCH_PROMPT.parameters.workdir,
    }),
  },
  { additionalProperties: false }
);

type ApplyPatchParameters = Static<typeof APPLY_PATCH_PARAMETERS>;

interface TextRenderContext {
  lastComponent?: unknown;
}

type ApplyPatchParametersSchema = typeof APPLY_PATCH_PARAMETERS;
type ApplyPatchRunner = (options: ApplyPatchOptions) => Promise<ApplyPatchResult>;

export interface ApplyPatchToolDetails extends ApplyPatchResult {
  count: number;
}

export interface ApplyPatchToolOptions {
  cwd?: string;
  runner?: ApplyPatchRunner;
}

export function registerApplyPatchTool(pi: ExtensionAPI): void {
  pi.registerTool(createApplyPatchToolDefinition());
}

export function createApplyPatchToolDefinition(
  options: ApplyPatchToolOptions = {}
): ToolDefinition<ApplyPatchParametersSchema, ApplyPatchToolDetails | undefined> {
  const runner = options.runner ?? applyPatch;

  const tool = createTextToolDefinition<ApplyPatchParametersSchema, ApplyPatchToolDetails | undefined>({
    metadata: APPLY_PATCH_TOOL_DEFINITION,
    parameters: APPLY_PATCH_PARAMETERS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = options.cwd ?? ctx.cwd;
        const workdir = normalizeWorkdir(params.workdir);
        const result = await runner({ cwd, patch: params.patch, ...(workdir === undefined ? {} : { workdir }) });
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
        throw new Error(formatApplyPatchError(error), { cause: error });
      }
    },
    formatCall: formatApplyPatchCall,
  });

  return {
    ...tool,
    constrainedSampling: {
      type: 'json_schema',
      strict: 'prefer',
    },
    renderResult(result, resultOptions, theme, context) {
      return renderApplyPatchResult(result, resultOptions, theme, context);
    },
  };
}

function normalizeWorkdir(workdir: string | null | undefined): string | undefined {
  if (workdir === undefined || workdir === null) return undefined;
  const normalized = normalizeToolPath(workdir);
  return normalized.length === 0 ? undefined : normalized;
}

function formatApplyPatchCall(args: ApplyPatchParameters | undefined, theme: Theme): string {
  return formatToolCall(theme, {
    toolName: APPLY_PATCH_TOOL_DEFINITION.name,
    query: '',
    paths: normalizeWorkdir(args?.workdir) ?? '.',
    flags: '',
  });
}

function formatApplyPatchError(error: unknown): string {
  if (error instanceof ApplyPatchFailure) return formatApplyPatchFailure(error);
  const message = formatUnhandledApplyPatchError(error);
  return `Patch failed:\n${message}`;
}

function formatUnhandledApplyPatchError(error: unknown): string {
  if (error instanceof InvalidPatchError || error instanceof InvalidHunkError) return formatPatchParseError(error);
  return error instanceof Error ? error.message : String(error);
}

function renderApplyPatchResult(
  result: Awaited<ReturnType<ToolDefinition<ApplyPatchParametersSchema, ApplyPatchToolDetails | undefined>['execute']>>,
  options: ToolRenderResultOptions,
  theme: Theme,
  context: TextRenderContext
): Text {
  const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);
  text.setText(formatTextToolResult(result, options, theme));
  return text;
}
