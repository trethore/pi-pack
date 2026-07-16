import type { ExtensionAPI, Theme, ToolDefinition, ToolRenderResultOptions } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { type Static, Type } from 'typebox';

import { applyPatch, type ApplyPatchOptions, type ApplyPatchResult } from '#src/features/apply-patch/apply.js';
import { countApplyPatchSummary, formatApplyPatchSummary } from '#src/features/apply-patch/format.js';
import { formatPatchParseError, InvalidHunkError, InvalidPatchError } from '#src/features/apply-patch/parser.js';
import { normalizeToolPath } from '#src/utils/paths.js';
import { createTextToolDefinition, formatToolCall } from '#src/utils/tool-definition.js';
import { formatTextToolResult } from '#src/utils/tool-results.js';

const APPLY_PATCH_PARAMETERS = Type.Object(
  {
    patch: Type.String({ description: 'Patch to apply.' }),
    workdir: Type.Optional(
      Type.String({
        description:
          'Optional working directory for resolving relative paths in the patch. If omitted, paths are resolved against the current working directory.',
      })
    ),
  },
  { additionalProperties: false }
);

const APPLY_PATCH_TOOL_DEFINITION = {
  name: 'apply_patch',
  label: 'apply_patch',
  description: [
    'Apply a patch using a simplified, file-oriented diff format.',
    'Patch must start with `*** Begin Patch` and end with `*** End Patch`. Supported hunks are `*** Add File:`, `*** Delete File:`, and `*** Update File:` with optional `*** Move to:`.',
    'Add targets and move destinations must not already exist.',
    'Automatically creates parent directories. Optionally, specify a working directory to resolve relative paths.',
  ].join('\n'),
  promptSnippet: 'Apply add, update, delete, and move file edits from a patch',
  promptGuidelines: [
    'Use `apply_patch` to edit file contents or file paths using the Codex apply_patch format.',
    'The `apply_patch` input must start with `*** Begin Patch\n` and end with `*** End Patch\n`.',
    '`apply_patch` supports `*** Add File:`, `*** Delete File:`, and `*** Update File:` hunks with optional `*** Move to:`.',
    '`apply_patch` requires add targets and move destinations not to exist.',
    'Relative paths passed to `apply_patch` are resolved against `workdir` when provided; otherwise, they are resolved against the current working directory.',
  ],
};

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
        const result = await runner({ cwd, patch: params.patch, workdir: normalizeWorkdir(params.workdir) });
        return {
          content: [
            {
              type: 'text',
              text: 'Success.',
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

  return {
    ...tool,
    renderResult(result, resultOptions, theme, context) {
      return renderApplyPatchResult(result, resultOptions, theme, context);
    },
  };
}

function normalizeWorkdir(workdir: string | undefined): string | undefined {
  if (workdir === undefined) return undefined;
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
  if (error instanceof InvalidPatchError || error instanceof InvalidHunkError) return formatPatchParseError(error);
  return error instanceof Error ? error.message : String(error);
}

function renderApplyPatchResult(
  result: Awaited<ReturnType<ToolDefinition<ApplyPatchParametersSchema, ApplyPatchToolDetails | undefined>['execute']>>,
  options: ToolRenderResultOptions,
  theme: Theme,
  context: TextRenderContext
): Text {
  const text = (context.lastComponent as Text | undefined) ?? new Text('', 0, 0);
  text.setText(formatTextToolResult(formatApplyPatchRenderResult(result), options, theme));
  return text;
}

function formatApplyPatchRenderResult(
  result: Awaited<ReturnType<ToolDefinition<ApplyPatchParametersSchema, ApplyPatchToolDetails | undefined>['execute']>>
) {
  if (result.details === undefined) return result;
  return {
    content: [
      {
        type: 'text',
        text: formatApplyPatchSummary(result.details),
      },
    ],
  };
}
