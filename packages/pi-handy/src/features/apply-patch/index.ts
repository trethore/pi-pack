import { type ExtensionAPI, keyHint, renderDiff } from '@earendil-works/pi-coding-agent';
import { Container, Spacer, Text } from '@earendil-works/pi-tui';
import { type Static, Type } from 'typebox';
import { applyPatch } from '#src/features/apply-patch/apply-patch.js';

const APPLY_PATCH_PARAMS = Type.Object({
  patch: Type.String({ description: 'Git-style unified diff to apply.' }),
});

type ApplyPatchParams = Static<typeof APPLY_PATCH_PARAMS>;

type ApplyPatchToolResult = {
  content: Array<{ type: string; text?: string }>;
};

const COLLAPSED_DIFF_LINE_LIMIT = 12;

function formatApplyPatchCall(): string {
  return 'apply_patch';
}

function formatApplyPatchResult(
  patch: string | undefined,
  result: ApplyPatchToolResult,
  expanded: boolean,
  isError: boolean
): string | undefined {
  if (isError) {
    return result.content
      .filter((content) => content.type === 'text')
      .map((content) => content.text ?? '')
      .filter((text) => text.length > 0)
      .join('\n');
  }

  if (!patch) return undefined;

  const diff = renderDiff(patch);
  const lines = diff.split('\n');
  if (expanded || lines.length <= COLLAPSED_DIFF_LINE_LIMIT) return diff;

  const hiddenLines = lines.length - COLLAPSED_DIFF_LINE_LIMIT;
  return [
    ...lines.slice(0, COLLAPSED_DIFF_LINE_LIMIT),
    `... (${hiddenLines} more lines, ${lines.length} total, ${keyHint('app.tools.expand', 'to expand')})`,
  ].join('\n');
}

export function registerApplyPatchTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'apply_patch',
    label: 'Apply Patch',
    description: 'Apply a git-style unified diff to workspace files.',
    promptSnippet: 'Apply focused file edits with a git-style unified diff.',
    promptGuidelines: [
      'Use apply_patch only with git-style unified diffs: diff --git, ---/+++, and @@ hunk headers.',
      'Keep patches focused; they must apply cleanly with git apply.',
    ],
    parameters: APPLY_PATCH_PARAMS,
    renderCall(_args, theme) {
      return new Text(theme.fg('toolTitle', theme.bold(formatApplyPatchCall())), 0, 0);
    },
    renderResult(result, _options, theme, context) {
      const patch = (context.args as ApplyPatchParams | undefined)?.patch;
      const output = formatApplyPatchResult(patch, result, context.expanded, context.isError);
      const component = (context.lastComponent as Container | undefined) ?? new Container();
      component.clear();

      if (!output) return component;

      component.addChild(new Spacer(1));
      component.addChild(new Text(context.isError ? theme.fg('error', output) : output, 0, 0));
      return component;
    },
    async execute(_toolCallId, params: ApplyPatchParams, _signal, _onUpdate, ctx) {
      const result = await applyPatch(ctx.cwd, params.patch);
      return {
        content: [{ type: 'text', text: result.output }],
        details: result,
      };
    },
  });
}
