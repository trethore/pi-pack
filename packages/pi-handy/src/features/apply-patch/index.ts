import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';
import { applyPatchOperation } from '#src/features/apply-patch/apply-patch.js';

const OPERATION_TYPE_VALUES = [
  'create_file',
  'update_file',
  'delete_file',
  'create',
  'update',
  'delete',
  'add',
  'modify',
  'remove',
] as const;

const OPERATION_TYPE = Type.Union(
  OPERATION_TYPE_VALUES.map((value) => Type.Literal(value)),
  {
    description:
      'Operation to perform. Preferred values: create_file, update_file, delete_file. Aliases are also accepted: create/add, update/modify, delete/remove.',
  }
);

const APPLY_PATCH_OPERATION = Type.Object({
  type: OPERATION_TYPE,
  path: Type.String({ description: 'Workspace-relative file path to create, update, or delete.' }),
  diff: Type.Optional(
    Type.String({
      description:
        'Required for create/add and update/modify operations. V4A-style diff or, for creates, full file contents.',
    })
  ),
});

const APPLY_PATCH_PARAMS = Type.Object({
  operation: APPLY_PATCH_OPERATION,
});

type ApplyPatchParams = Static<typeof APPLY_PATCH_PARAMS>;

export function registerApplyPatchTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'apply_patch',
    label: 'Apply Patch',
    description: 'Create, update, or delete workspace files with structured diffs.',
    promptSnippet:
      'Use apply_patch for focused file edits. Operations: create_file, update_file, delete_file. Aliases: create/add, update/modify, delete/remove.',
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
