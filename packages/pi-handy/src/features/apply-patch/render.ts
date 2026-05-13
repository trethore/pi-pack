import { keyHint, type Theme } from '@earendil-works/pi-coding-agent';
import { Container, Spacer, Text } from '@earendil-works/pi-tui';

export type ApplyPatchToolResult = {
  content: Array<{ type: string; text?: string }>;
};

export type RenderApplyPatchResultOptions = {
  patch: string | undefined;
  result: ApplyPatchToolResult;
  expanded: boolean;
  isError: boolean;
  theme: Theme;
  lastComponent: unknown;
};

const COLLAPSED_DIFF_LINE_LIMIT = 12;

export function renderApplyPatchCall(theme: Theme): Text {
  return new Text(theme.fg('toolTitle', theme.bold('apply_patch')), 0, 0);
}

export function renderApplyPatchResult(options: RenderApplyPatchResultOptions): Container {
  const output = formatApplyPatchResult(options);
  const component = (options.lastComponent as Container | undefined) ?? new Container();
  component.clear();

  if (!output) return component;

  component.addChild(new Spacer(1));
  component.addChild(new Text(options.isError ? options.theme.fg('error', output) : output, 0, 0));
  return component;
}

function formatApplyPatchResult({
  patch,
  result,
  expanded,
  isError,
  theme,
}: RenderApplyPatchResultOptions): string | undefined {
  if (isError) return formatErrorResult(result);
  if (!patch) return undefined;

  const diffLines = renderGitStyleDiffLines(patch, theme);
  if (expanded || diffLines.length <= COLLAPSED_DIFF_LINE_LIMIT) return diffLines.join('\n');

  const hiddenLines = diffLines.length - COLLAPSED_DIFF_LINE_LIMIT;
  return [
    ...diffLines.slice(0, COLLAPSED_DIFF_LINE_LIMIT),
    theme.fg(
      'muted',
      `... (${hiddenLines} more lines, ${diffLines.length} total, ${keyHint('app.tools.expand', 'to expand')})`
    ),
  ].join('\n');
}

function formatErrorResult(result: ApplyPatchToolResult): string {
  return result.content
    .filter((content) => content.type === 'text')
    .map((content) => content.text ?? '')
    .filter((text) => text.length > 0)
    .join('\n');
}

function renderGitStyleDiffLines(diffText: string, theme: Theme): string[] {
  return diffText.split('\n').map((line) => renderGitStyleDiffLine(line, theme));
}

function renderGitStyleDiffLine(line: string, theme: Theme): string {
  if (isAddedFileMetadata(line) || isAddedDiffLine(line)) return theme.fg('toolDiffAdded', line);
  if (isDeletedFileMetadata(line) || isDeletedDiffLine(line))
    return theme.fg('toolDiffRemoved', line);
  return theme.fg('toolDiffContext', line);
}

function isAddedDiffLine(line: string): boolean {
  return line.startsWith('+') && !line.startsWith('+++');
}

function isDeletedDiffLine(line: string): boolean {
  return line.startsWith('-') && !line.startsWith('---');
}

function isAddedFileMetadata(line: string): boolean {
  return (
    line.startsWith('new file mode ') ||
    line.startsWith('rename to ') ||
    line.startsWith('copy to ') ||
    line.startsWith('+++ ')
  );
}

function isDeletedFileMetadata(line: string): boolean {
  return (
    line.startsWith('deleted file mode ') ||
    line.startsWith('rename from ') ||
    line.startsWith('copy from ') ||
    line.startsWith('--- ')
  );
}
