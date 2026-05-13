import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';
import { applyPatch } from '#src/features/apply-patch/apply-patch.js';

const APPLY_PATCH_PARAMS = Type.Object({
  patch: Type.String({ description: 'Unified diff/git diff patch to apply to the workspace.' }),
});

type ApplyPatchParams = Static<typeof APPLY_PATCH_PARAMS>;

export function registerApplyPatchTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'apply_patch',
    label: 'Apply Patch',
    description: 'Apply a unified diff/git diff patch to workspace files.',
    promptSnippet: 'Use apply_patch for focused file edits. Provide a standard unified diff patch.',
    promptGuidelines: [
      'Use standard unified diff or git diff format.',
      'Include file headers and hunk headers.',
      'Keep patches small and focused.',
      'Do not use fuzzy patches; context must apply cleanly with git apply.',
    ],
    parameters: APPLY_PATCH_PARAMS,
    async execute(_toolCallId, params: ApplyPatchParams, _signal, _onUpdate, ctx) {
      const result = await applyPatch(ctx.cwd, params.patch);
      return {
        content: [{ type: 'text', text: result.output }],
        details: result,
      };
    },
  });
}
