import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { Theme, ToolDefinition, ToolRenderResultOptions } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import type { Static, TSchema } from 'typebox';

import { formatTextToolResult, type TextToolResult } from '#src/utils/tool-results.js';

interface TextRenderContext {
  lastComponent?: unknown;
}

interface TextToolMetadata {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

interface CreateTextToolDefinitionOptions<TParameters extends TSchema, TDetails> {
  metadata: TextToolMetadata;
  parameters: TParameters;
  execute: ToolDefinition<TParameters, TDetails>['execute'];
  formatCall: (args: Static<TParameters> | undefined, theme: Theme) => string;
}

export function createTextToolDefinition<TParameters extends TSchema, TDetails>(
  options: CreateTextToolDefinitionOptions<TParameters, TDetails>
): ToolDefinition<TParameters, TDetails> {
  return {
    name: options.metadata.name,
    label: options.metadata.label,
    description: options.metadata.description,
    promptSnippet: options.metadata.promptSnippet,
    promptGuidelines: options.metadata.promptGuidelines,
    parameters: options.parameters,
    execute: options.execute,
    renderCall(args, theme, context) {
      return renderTextCall(args, theme, context, options.formatCall);
    },
    renderResult(result, resultOptions, theme, context) {
      return renderTextResult(result, resultOptions, theme, context);
    },
  };
}

function renderTextCall<TArgs>(
  args: TArgs | undefined,
  theme: Theme,
  context: TextRenderContext,
  format: (args: TArgs | undefined, theme: Theme) => string
): Text {
  return renderText(context, format(args, theme));
}

function renderTextResult(
  result: TextToolResult,
  options: ToolRenderResultOptions,
  theme: Theme,
  context: TextRenderContext
): Text {
  return renderText(context, formatTextToolResult(result, options, theme));
}

export async function assertSearchPaths(
  cwd: string,
  searchPaths: readonly string[],
  options: { toolName: string; requireDirectory?: boolean }
): Promise<void> {
  await Promise.all(searchPaths.map((searchPath) => assertSearchPath(resolveSearchPath(cwd, searchPath), options)));
}

export function formatToolCall(
  theme: Theme,
  options: { toolName: string; query: string; paths: string; flags: string }
): string {
  const suffix = options.flags ? theme.fg('toolOutput', ` (${options.flags})`) : '';
  const query = options.query ? [' ', theme.fg('accent', options.query)] : [];

  return [
    theme.fg('toolTitle', theme.bold(options.toolName)),
    ...query,
    theme.fg('toolOutput', ` in ${options.paths}`),
    suffix,
  ].join('');
}

function renderText(context: TextRenderContext, value: string): Text {
  const text = (context.lastComponent as Text | undefined) ?? new Text('', 0, 0);
  text.setText(value);
  return text;
}

function resolveSearchPath(cwd: string, searchPath: string): string {
  return path.resolve(cwd, searchPath);
}

async function assertSearchPath(
  searchPath: string,
  options: { toolName: string; requireDirectory?: boolean }
): Promise<void> {
  let stats;
  try {
    stats = await stat(searchPath);
  } catch (error) {
    throw new Error(`${options.toolName} failed: search path does not exist: ${searchPath}`, {
      cause: error,
    });
  }

  if (options.requireDirectory === true && !stats.isDirectory()) {
    throw new Error(`${options.toolName} failed: search path is not a directory: ${searchPath}`);
  }
}
