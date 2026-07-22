import {
  DEFAULT_MAX_BYTES,
  formatSize,
  type Theme,
  type ToolRenderResultOptions,
  type TruncationResult,
} from '@earendil-works/pi-coding-agent';
import { formatKeybindingText } from '@trethore/pi-shared/ui/keybindings.js';
import type { ToolOutputTruncationDetails } from '#src/utils/output-limits.js';

const DEFAULT_COLLAPSED_RESULT_LINES = 10;
export const SUMMARY_ONLY_COLLAPSED_RESULT_LINES = 1;

export interface TextToolResult {
  content: Array<{ type: string; text?: string }>;
  details?: ToolOutputTruncationDetails;
}

export function formatTextToolResult(
  result: TextToolResult,
  options: ToolRenderResultOptions,
  theme: Theme,
  collapsedResultLines = DEFAULT_COLLAPSED_RESULT_LINES
): string {
  const output = stripInlineTruncationNotice(getTextOutput(result).trim(), result, options);
  let text = '';

  if (output) {
    const lines = output.split('\n');
    const maxLines = options.expanded ? lines.length : collapsedResultLines;
    const displayLines = lines.slice(0, maxLines);
    const remaining = lines.length - maxLines;
    text = `\n${displayLines.map((line) => theme.fg('toolOutput', line)).join('\n')}`;

    if (remaining > 0) {
      text += theme.fg(
        'muted',
        `\n... (${remaining} more lines, ${formatKeybindingText('app.tools.expand')} to expand)`
      );
    }
  }

  text += formatTruncationWarning(result, theme);
  return text;
}

function stripInlineTruncationNotice(output: string, result: TextToolResult, options: ToolRenderResultOptions): string {
  const fullOutputPath = result.details?.fullOutputPath;
  if (options.isPartial || !result.details?.truncation?.truncated || !fullOutputPath || !output.endsWith(']')) {
    return output;
  }

  const footerStart = output.lastIndexOf('\n\n[');
  if (footerStart === -1 || !output.slice(footerStart).includes(fullOutputPath)) return output;
  return output.slice(0, footerStart).trimEnd();
}

function formatTruncationWarning(result: TextToolResult, theme: Theme): string {
  const warnings = [
    formatFullOutputWarning(result.details?.fullOutputPath),
    formatTruncationDetail(result.details?.truncation),
  ].filter((warning): warning is string => warning !== undefined);
  if (warnings.length === 0) return '';

  return `\n${theme.fg('warning', `[${warnings.join('. ')}]`)}`;
}

function formatFullOutputWarning(fullOutputPath: string | undefined): string | undefined {
  return fullOutputPath ? `Full output: ${fullOutputPath}` : undefined;
}

function formatTruncationDetail(truncation: TruncationResult | undefined): string | undefined {
  if (!truncation?.truncated) return undefined;
  if (truncation.truncatedBy === 'lines') {
    return `Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
  }
  return `Truncated: ${truncation.outputLines} lines shown (${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit)`;
}

function getTextOutput(result: TextToolResult): string {
  return result.content
    .filter((item) => item.type === 'text' && item.text !== undefined)
    .map((item) => item.text)
    .join('\n');
}
