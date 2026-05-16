import type { Theme, ToolRenderResultOptions } from '@earendil-works/pi-coding-agent';
import { getKeybindings } from '@earendil-works/pi-tui';

const DEFAULT_COLLAPSED_RESULT_LINES = 10;

export interface TextToolResult {
  content: Array<{ type: string; text?: string }>;
}

export function formatTextToolResult(
  result: TextToolResult,
  options: ToolRenderResultOptions,
  theme: Theme,
  collapsedResultLines = DEFAULT_COLLAPSED_RESULT_LINES
): string {
  const output = getTextOutput(result).trim();
  if (!output) return '';

  const lines = output.split('\n');
  const maxLines = options.expanded ? lines.length : collapsedResultLines;
  const displayLines = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;
  let text = `\n${displayLines.map((line) => theme.fg('toolOutput', line)).join('\n')}`;

  if (remaining > 0) {
    text += theme.fg('muted', `\n... (${remaining} more lines, ${formatExpansionKey()} to expand)`);
  }

  return text;
}

export function hasZeroCountDetails(details: unknown): boolean {
  return (
    typeof details === 'object' &&
    details !== null &&
    'count' in details &&
    (details as { count: unknown }).count === 0
  );
}

function getTextOutput(result: TextToolResult): string {
  return result.content
    .filter((item) => item.type === 'text' && item.text !== undefined)
    .map((item) => item.text)
    .join('\n');
}

function formatExpansionKey(): string {
  const keys = getKeybindings().getKeys('app.tools.expand');
  return keys.length > 0 ? keys.join('/') : 'app.tools.expand';
}
