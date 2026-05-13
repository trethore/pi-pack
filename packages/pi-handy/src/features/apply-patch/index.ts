import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';
import { applyPatchOperation } from '#src/features/apply-patch/apply-patch.js';

const CREATE_FILE_OPERATION = Type.Object({
  type: Type.Literal('create_file', { description: 'Create a new file at path.' }),
  path: Type.String({ description: 'Workspace-relative file path to create.' }),
  diff: Type.String({ description: 'V4A-style diff representing the full file contents.' }),
});

const UPDATE_FILE_OPERATION = Type.Object({
  type: Type.Literal('update_file', { description: 'Modify an existing file at path.' }),
  path: Type.String({ description: 'Workspace-relative file path to update.' }),
  diff: Type.String({ description: 'V4A-style diff with additions, deletions, or replacements.' }),
});

const DELETE_FILE_OPERATION = Type.Object({
  type: Type.Literal('delete_file', { description: 'Delete the file at path.' }),
  path: Type.String({ description: 'Workspace-relative file path to delete.' }),
});

const APPLY_PATCH_PARAMS = Type.Object({
  operation: Type.Union([CREATE_FILE_OPERATION, UPDATE_FILE_OPERATION, DELETE_FILE_OPERATION], {
    description: 'Single apply_patch file operation to perform.',
  }),
});

type ApplyPatchParams = Static<typeof APPLY_PATCH_PARAMS>;

export function registerApplyPatchTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'apply_patch',
    label: 'Apply Patch',
    description: 'Create, update, or delete workspace files with structured diffs.',
    promptSnippet:
      'Use apply_patch for focused file edits. Operations: create_file, update_file, delete_file.',
    promptGuidelines: [
      'Use workspace-relative paths.',
      'Keep diffs small and focused.',
      'Include enough context for `update_file` to match.',
      'Use `delete_file` only when removal is intended.',
    ],
    parameters: APPLY_PATCH_PARAMS,
    async execute(_toolCallId, params: ApplyPatchParams, _signal, _onUpdate, ctx) {
      const result = await applyPatchOperation(ctx.cwd, params.operation);
      return {
        content: [{ type: 'text', text: result.output }],
        details: result,
      };
    },
  });
}
