import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  ExtensionAPI,
  Theme,
  ToolDefinition,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { getKeybindings, Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

import type { GlobToolConfig } from '#src/config/schema.js';
import { formatGlobResult } from '#src/features/glob/format.js';
import {
  runRipgrepGlob,
  type RipgrepGlobResult,
  type RunRipgrepGlobOptions,
} from '#src/features/glob/ripgrep.js';

const COLLAPSED_RESULT_LINES = 10;
const GLOB_TOOL_DEFINITION = readGlobDefinition();

interface GlobParameters {
  pattern: string;
  path?: string;
  limit?: number;
  noIgnore?: boolean;
  hidden?: boolean;
}

interface GlobDefinition {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: GlobParametersJsonSchema;
}

interface GlobParametersJsonSchema {
  type: 'object';
  additionalProperties: boolean;
  required: string[];
  properties: {
    pattern: Record<string, unknown>;
    path: Record<string, unknown>;
    limit: { description: string } & Record<string, unknown>;
    noIgnore: Record<string, unknown>;
    hidden: Record<string, unknown>;
  };
}

type GlobParametersSchema = ReturnType<typeof createGlobParametersSchema>;
type GlobRunner = (options: RunRipgrepGlobOptions) => Promise<RipgrepGlobResult>;

export interface GlobToolDetails {
  base: string;
  count: number;
  limited: boolean;
}

export interface GlobToolOptions {
  cwd?: string;
  runner?: GlobRunner;
}

export function registerGlobTool(pi: ExtensionAPI, config: { glob: GlobToolConfig }): void {
  if (!config.glob.enabled) return;
  pi.registerTool(createGlobToolDefinition(config.glob));
}

export function createGlobToolDefinition(
  config: GlobToolConfig,
  options: GlobToolOptions = {}
): ToolDefinition<GlobParametersSchema, GlobToolDetails | undefined> {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? runRipgrepGlob;
  const parameters = createGlobParametersSchema(config.defaultLimit);

  return {
    name: GLOB_TOOL_DEFINITION.name,
    label: GLOB_TOOL_DEFINITION.label,
    description: GLOB_TOOL_DEFINITION.description,
    promptSnippet: GLOB_TOOL_DEFINITION.promptSnippet,
    promptGuidelines: GLOB_TOOL_DEFINITION.promptGuidelines,
    parameters,
    async execute(_toolCallId, params, signal) {
      const preparedParams = prepareGlobParameters(params, config);
      const basePath = resolveBasePath(cwd, preparedParams.path);
      await assertDirectory(basePath);

      const result = await runner({
        basePath,
        pattern: preparedParams.pattern,
        limit: preparedParams.limit,
        noIgnore: preparedParams.noIgnore,
        hidden: preparedParams.hidden,
        signal,
      });

      const base = getBaseDisplay(cwd, preparedParams.path);

      return {
        content: [
          {
            type: 'text',
            text: formatGlobResult({
              base,
              files: result.files,
              limited: result.limited,
            }),
          },
        ],
        details: {
          base,
          count: result.files.length,
          limited: result.limited,
        },
      };
    },
    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text('', 0, 0);
      text.setText(formatGlobCall(args, theme));
      return text;
    },
    renderResult(result, options, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text('', 0, 0);
      text.setText(formatGlobRenderedResult(result, options, theme, context.isError));
      return text;
    },
  };
}

function readGlobDefinition(): GlobDefinition {
  return JSON.parse(
    readFileSync(new URL('glob-definition.json', import.meta.url), 'utf8')
  ) as GlobDefinition;
}

function createGlobParametersSchema(defaultLimit: number) {
  const parameters = cloneParametersSchema(GLOB_TOOL_DEFINITION.parameters);
  parameters.properties.limit.description = parameters.properties.limit.description.replace(
    '{{defaultLimit}}',
    String(defaultLimit)
  );
  return Type.Unsafe<GlobParameters>(parameters);
}

function cloneParametersSchema(parameters: GlobParametersJsonSchema): GlobParametersJsonSchema {
  return structuredClone(parameters);
}

function prepareGlobParameters(
  params: GlobParameters,
  config: GlobToolConfig
): Required<GlobParameters> {
  return {
    pattern: params.pattern,
    path: params.path?.trim() || '.',
    limit: params.limit ?? config.defaultLimit,
    noIgnore: params.noIgnore ?? false,
    hidden: params.hidden ?? false,
  };
}

function resolveBasePath(cwd: string, basePath: string): string {
  return path.resolve(cwd, basePath);
}

async function assertDirectory(basePath: string): Promise<void> {
  let stats;
  try {
    stats = await stat(basePath);
  } catch (error) {
    throw new Error(`glob failed: base path does not exist: ${basePath}`, { cause: error });
  }

  if (!stats.isDirectory()) {
    throw new Error(`glob failed: base path is not a directory: ${basePath}`);
  }
}

function getBaseDisplay(cwd: string, basePath: string): string {
  if (basePath === '.') return '.';

  const absoluteBasePath = resolveBasePath(cwd, basePath);
  const relativePath = path.relative(cwd, absoluteBasePath);
  return relativePath || '.';
}

function formatGlobCall(args: GlobParameters | undefined, theme: Theme): string {
  const pattern = args?.pattern ?? '';
  const basePath = args?.path?.trim() || '.';
  const flags = formatGlobFlags(args);
  const suffix = flags ? theme.fg('toolOutput', ` (${flags})`) : '';

  return [
    theme.fg('toolTitle', theme.bold('glob')),
    ' ',
    theme.fg('accent', pattern || '...'),
    theme.fg('toolOutput', ` in ${basePath}`),
    suffix,
  ].join('');
}

function formatGlobFlags(args: GlobParameters | undefined): string {
  const flags: string[] = [];
  if (args?.limit !== undefined) flags.push(`limit ${args.limit}`);
  if (args?.hidden) flags.push('hidden');
  if (args?.noIgnore) flags.push('no-ignore');
  return flags.join(', ');
}

function formatGlobRenderedResult(
  result: { content: Array<{ type: string; text?: string }>; details?: GlobToolDetails },
  options: ToolRenderResultOptions,
  theme: Theme,
  isError: boolean
): string {
  const output = getTextOutput(result).trim();
  if (!output) return '';

  const lines = output.split('\n');
  const maxLines = options.expanded ? lines.length : COLLAPSED_RESULT_LINES;
  const displayLines = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;
  const color = isError || result.details?.count === 0 ? 'error' : 'toolOutput';
  let text = `\n${displayLines.map((line) => theme.fg(color, line)).join('\n')}`;

  if (remaining > 0) {
    text += theme.fg('muted', `\n... (${remaining} more lines, ${formatExpansionKey()} to expand)`);
  }

  return text;
}

function getTextOutput(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((item) => item.type === 'text' && item.text !== undefined)
    .map((item) => item.text)
    .join('\n');
}

function formatExpansionKey(): string {
  const keys = getKeybindings().getKeys('app.tools.expand');
  return keys.length > 0 ? keys.join('/') : 'app.tools.expand';
}
