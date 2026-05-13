import { type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';
import { applyPatch } from '#src/features/apply-patch/apply-patch.js';
import { renderApplyPatchCall, renderApplyPatchResult } from '#src/features/apply-patch/render.js';

const APPLY_PATCH_PARAMS = Type.Object({
  patch: Type.String({ description: 'Git-style unified diff to apply.' }),
});

type ApplyPatchParams = Static<typeof APPLY_PATCH_PARAMS>;

export function registerApplyPatchTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'apply_patch',
    label: 'Apply Patch',
    description: 'Apply a git-style unified diff to workspace files.',
    promptSnippet: 'Apply focused file edits with a git-style unified diff.',
    promptGuidelines: [
      'Do not use simplified patch formats such as *** Begin Patch, *** Add File, or *** Update File; they will be rejected.',
      'Use apply_patch only with git-style unified diffs: diff --git, ---/+++, and @@ hunk headers.',
      'Keep patches focused; they must apply cleanly with git apply.',
    ],
    parameters: APPLY_PATCH_PARAMS,
    renderCall(_args, theme) {
      return renderApplyPatchCall(theme);
    },
    renderResult(result, _options, theme, context) {
      return renderApplyPatchResult({
        patch: (context.args as ApplyPatchParams | undefined)?.patch,
        result,
        expanded: context.expanded,
        isError: context.isError,
        theme,
        lastComponent: context.lastComponent,
      });
    },
    async execute(_toolCallId, params: ApplyPatchParams, _signal, _onUpdate, ctx) {
      const result = await applyPatch(ctx.cwd, params.patch);
      if (result.status === 'failed') {
        throw new Error(result.output);
      }

      return {
        content: [{ type: 'text', text: result.output }],
        details: result,
      };
    },
  });
}
