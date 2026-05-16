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

import type { GrepToolConfig } from '#src/config/schema.js';
import { createGrepDisplay, formatGrepDisplay } from '#src/features/grep/format.js';
import {
  runRipgrepGrep,
  type RipgrepGrepResult,
  type RunRipgrepGrepOptions,
} from '#src/features/grep/ripgrep.js';

const COLLAPSED_RESULT_LINES = 10;
const GREP_TOOL_DEFINITION = readGrepDefinition();

interface GrepParameters {
  regex: string;
  path?: string;
  limit?: number;
  limitPerFile?: number;
  maxCharsPerMatch?: number;
  noIgnore?: boolean;
  hidden?: boolean;
}

interface PreparedGrepParameters extends Required<Omit<GrepParameters, 'limitPerFile'>> {
  limitPerFile?: number;
}

interface GrepDefinition {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: GrepParametersJsonSchema;
}

interface GrepParametersJsonSchema {
  type: 'object';
  additionalProperties: boolean;
  required: string[];
  properties: {
    regex: Record<string, unknown>;
    path: Record<string, unknown>;
    limit: { description: string } & Record<string, unknown>;
    limitPerFile: { description: string } & Record<string, unknown>;
    maxCharsPerMatch: { description: string } & Record<string, unknown>;
    noIgnore: Record<string, unknown>;
    hidden: Record<string, unknown>;
  };
}

type GrepParametersSchema = ReturnType<typeof createGrepParametersSchema>;
type GrepRunner = (options: RunRipgrepGrepOptions) => Promise<RipgrepGrepResult>;

export interface GrepToolDetails {
  count: number;
  files: number;
  limited: boolean;
}

export interface GrepToolOptions {
  cwd?: string;
  runner?: GrepRunner;
}

export function registerGrepTool(pi: ExtensionAPI, config: { grep: GrepToolConfig }): void {
  if (!config.grep.enabled) return;
  pi.registerTool(createGrepToolDefinition(config.grep));
  pi.on('tool_result', (event) => {
    if (event.toolName !== GREP_TOOL_DEFINITION.name || !isZeroCountGrepDetails(event.details)) {
      return;
    }

    return { isError: true };
  });
}

export function createGrepToolDefinition(
  config: GrepToolConfig,
  options: GrepToolOptions = {}
): ToolDefinition<GrepParametersSchema, GrepToolDetails | undefined> {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? runRipgrepGrep;
  const parameters = createGrepParametersSchema(config);

  return {
    name: GREP_TOOL_DEFINITION.name,
    label: GREP_TOOL_DEFINITION.label,
    description: GREP_TOOL_DEFINITION.description,
    promptSnippet: GREP_TOOL_DEFINITION.promptSnippet,
    promptGuidelines: GREP_TOOL_DEFINITION.promptGuidelines,
    parameters,
    async execute(_toolCallId, params, signal) {
      const preparedParams = prepareGrepParameters(params, config);
      const searchPath = resolveSearchPath(cwd, preparedParams.path);
      await assertPathExists(searchPath);

      const result = await runner({
        cwd,
        searchPath: preparedParams.path,
        regex: preparedParams.regex,
        limit: preparedParams.limit,
        limitPerFile: preparedParams.limitPerFile,
        maxCharsPerMatch: preparedParams.maxCharsPerMatch,
        noIgnore: preparedParams.noIgnore,
        hidden: preparedParams.hidden,
        signal,
      });
      const display = createGrepDisplay({
        matches: result.matches,
        limit: preparedParams.limit,
        limitPerFile: preparedParams.limitPerFile,
        limited: result.limited,
      });

      return {
        content: [
          {
            type: 'text',
            text: formatGrepDisplay(display),
          },
        ],
        details: {
          count: display.matches.length,
          files: display.files,
          limited: result.limited,
        },
      };
    },
    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text('', 0, 0);
      text.setText(formatGrepCall(args, theme));
      return text;
    },
    renderResult(result, options, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text('', 0, 0);
      text.setText(formatGrepRenderedResult(result, options, theme));
      return text;
    },
  };
}

function readGrepDefinition(): GrepDefinition {
  return JSON.parse(
    readFileSync(new URL('grep-definition.json', import.meta.url), 'utf8')
  ) as GrepDefinition;
}

function createGrepParametersSchema(config: GrepToolConfig) {
  const parameters = cloneParametersSchema(GREP_TOOL_DEFINITION.parameters);
  parameters.properties.limit.description = parameters.properties.limit.description.replace(
    '{{defaultLimit}}',
    String(config.defaultLimit)
  );
  parameters.properties.limitPerFile.description =
    parameters.properties.limitPerFile.description.replace(
      '{{limitPerFileDefault}}',
      formatLimitPerFileDefault(config.defaultLimitPerFile)
    );
  parameters.properties.maxCharsPerMatch.description =
    parameters.properties.maxCharsPerMatch.description.replace(
      '{{defaultMaxCharsPerMatch}}',
      String(config.defaultMaxCharsPerMatch)
    );
  return Type.Unsafe<GrepParameters>(parameters);
}

function cloneParametersSchema(parameters: GrepParametersJsonSchema): GrepParametersJsonSchema {
  return structuredClone(parameters);
}

function formatLimitPerFileDefault(defaultLimitPerFile: number | undefined): string {
  if (defaultLimitPerFile === undefined) return ' If omitted, no per-file limit is applied.';
  return ` If omitted, defaults to ${defaultLimitPerFile}.`;
}

function prepareGrepParameters(
  params: GrepParameters,
  config: GrepToolConfig
): PreparedGrepParameters {
  return {
    regex: params.regex,
    path: params.path?.trim() || '.',
    limit: params.limit ?? config.defaultLimit,
    limitPerFile: params.limitPerFile ?? config.defaultLimitPerFile,
    maxCharsPerMatch: params.maxCharsPerMatch ?? config.defaultMaxCharsPerMatch,
    noIgnore: params.noIgnore ?? false,
    hidden: params.hidden ?? false,
  };
}

function resolveSearchPath(cwd: string, searchPath: string): string {
  return path.resolve(cwd, searchPath);
}

async function assertPathExists(searchPath: string): Promise<void> {
  try {
    await stat(searchPath);
  } catch (error) {
    throw new Error(`grep failed: search path does not exist: ${searchPath}`, { cause: error });
  }
}

function formatGrepCall(args: GrepParameters | undefined, theme: Theme): string {
  const regex = args?.regex ?? '';
  const searchPath = args?.path?.trim() || '.';
  const flags = formatGrepFlags(args);
  const suffix = flags ? theme.fg('toolOutput', ` (${flags})`) : '';

  return [
    theme.fg('toolTitle', theme.bold('grep')),
    ' ',
    theme.fg('accent', regex || '...'),
    theme.fg('toolOutput', ` in ${searchPath}`),
    suffix,
  ].join('');
}

function formatGrepFlags(args: GrepParameters | undefined): string {
  return [
    formatOptionalNumberFlag('limit', args?.limit),
    formatOptionalNumberFlag('limit/file', args?.limitPerFile),
    formatOptionalNumberFlag('chars', args?.maxCharsPerMatch),
    args?.noIgnore ? 'noIgnore' : undefined,
    args?.hidden ? 'hidden' : undefined,
  ]
    .filter((flag): flag is string => flag !== undefined)
    .join(', ');
}

function formatOptionalNumberFlag(label: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${label} ${value}`;
}

function formatGrepRenderedResult(
  result: { content: Array<{ type: string; text?: string }>; details?: GrepToolDetails },
  options: ToolRenderResultOptions,
  theme: Theme
): string {
  const output = getTextOutput(result).trim();
  if (!output) return '';

  const lines = output.split('\n');
  const maxLines = options.expanded ? lines.length : COLLAPSED_RESULT_LINES;
  const displayLines = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;
  const color = 'toolOutput';
  let text = `\n${displayLines.map((line) => theme.fg(color, line)).join('\n')}`;

  if (remaining > 0) {
    text += theme.fg('muted', `\n... (${remaining} more lines, ${formatExpansionKey()} to expand)`);
  }

  return text;
}

function isZeroCountGrepDetails(details: unknown): details is GrepToolDetails {
  return (
    typeof details === 'object' &&
    details !== null &&
    'count' in details &&
    (details as { count: unknown }).count === 0
  );
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
