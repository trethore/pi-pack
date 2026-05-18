import type { ExtensionAPI, Theme, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { GrepToolConfig } from '#src/config/schema.js';
import { createGrepDisplay, formatGrepDisplay } from '#src/features/grep/format.js';
import {
  formatOptionalStringListFlag,
  formatStringList,
  normalizeOptionalStringList,
  normalizeRequiredStringList,
} from '#src/utils/string-list.js';
import {
  assertSearchPaths,
  cloneJsonSchema,
  formatToolCall,
  readJsonDefinition,
  registerZeroCountToolResultError,
  renderTextCall,
  renderTextResult,
} from '#src/utils/tool-definition.js';
import {
  runRipgrepGrep,
  type RipgrepGrepResult,
  type RunRipgrepGrepOptions,
} from '#src/features/grep/ripgrep.js';

const GREP_TOOL_DEFINITION = readGrepDefinition();

interface GrepParameters {
  regexes: string[];
  paths?: string[];
  globs?: string[];
  limit?: number;
  limitPerFile?: number;
  depth?: number;
  maxCharsPerMatch?: number;
  noIgnore?: boolean;
  visibleOnly?: boolean;
}

interface PreparedGrepParameters extends Required<Omit<GrepParameters, 'limitPerFile' | 'depth'>> {
  limitPerFile?: number;
  depth?: number;
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
    regexes: Record<string, unknown>;
    paths: Record<string, unknown>;
    globs: Record<string, unknown>;
    limit: { description: string } & Record<string, unknown>;
    limitPerFile: { description: string } & Record<string, unknown>;
    depth: Record<string, unknown>;
    maxCharsPerMatch: { description: string } & Record<string, unknown>;
    noIgnore: Record<string, unknown>;
    visibleOnly: Record<string, unknown>;
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
  registerZeroCountToolResultError(pi, GREP_TOOL_DEFINITION.name);
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
      await assertSearchPaths(cwd, preparedParams.paths, { toolName: 'grep' });

      const result = await runner({
        cwd,
        regexes: preparedParams.regexes,
        paths: preparedParams.paths,
        globs: preparedParams.globs,
        limit: preparedParams.limit,
        limitPerFile: preparedParams.limitPerFile,
        depth: preparedParams.depth,
        maxCharsPerMatch: preparedParams.maxCharsPerMatch,
        noIgnore: preparedParams.noIgnore,
        visibleOnly: preparedParams.visibleOnly,
        signal,
      });
      const display = createGrepDisplay({
        matches: result.matches,
        limit: preparedParams.limit,
        paths: preparedParams.paths,
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
      return renderTextCall(args, theme, context, formatGrepCall);
    },
    renderResult(result, options, theme, context) {
      return renderTextResult(result, options, theme, context);
    },
  };
}

function readGrepDefinition(): GrepDefinition {
  return readJsonDefinition(new URL('grep-definition.json', import.meta.url));
}

function createGrepParametersSchema(config: GrepToolConfig) {
  const parameters = cloneParametersSchema(GREP_TOOL_DEFINITION.parameters);
  parameters.properties.limit.description = parameters.properties.limit.description.replace(
    '{{defaultLimit}}',
    String(config.defaultLimit)
  );
  parameters.properties.limitPerFile.description =
    parameters.properties.limitPerFile.description.replace(
      '{{defaultLimitPerFile}}',
      formatDefaultLimitPerFileValue(config.defaultLimitPerFile)
    );
  parameters.properties.maxCharsPerMatch.description =
    parameters.properties.maxCharsPerMatch.description.replace(
      '{{defaultMaxCharsPerMatch}}',
      String(config.defaultMaxCharsPerMatch)
    );
  return Type.Unsafe<GrepParameters>(parameters);
}

function cloneParametersSchema(parameters: GrepParametersJsonSchema): GrepParametersJsonSchema {
  return cloneJsonSchema(parameters);
}

function formatDefaultLimitPerFileValue(defaultLimitPerFile: number | undefined): string {
  return defaultLimitPerFile === undefined ? 'no per-file limit' : String(defaultLimitPerFile);
}

function prepareGrepParameters(
  params: GrepParameters,
  config: GrepToolConfig
): PreparedGrepParameters {
  return {
    regexes: normalizeRequiredStringList(params.regexes, {
      name: 'regexes',
      toolName: 'grep',
    }),
    paths: normalizeOptionalStringList(params.paths, ['.']),
    globs: normalizeOptionalStringList(params.globs, []),
    limit: params.limit ?? config.defaultLimit,
    limitPerFile: params.limitPerFile ?? config.defaultLimitPerFile,
    depth: params.depth,
    maxCharsPerMatch: params.maxCharsPerMatch ?? config.defaultMaxCharsPerMatch,
    noIgnore: params.noIgnore ?? false,
    visibleOnly: params.visibleOnly ?? false,
  };
}

function formatGrepCall(args: GrepParameters | undefined, theme: Theme): string {
  const regexes = formatStringList(args?.regexes, '...');
  const searchPaths = formatStringList(args?.paths, '.');
  const flags = formatGrepFlags(args);
  return formatToolCall(theme, {
    toolName: 'grep',
    query: regexes,
    paths: searchPaths,
    flags,
  });
}

function formatGrepFlags(args: GrepParameters | undefined): string {
  return [
    formatOptionalNumberFlag('limit', args?.limit),
    formatOptionalNumberFlag('limit/file', args?.limitPerFile),
    formatOptionalNumberFlag('depth', args?.depth),
    formatOptionalNumberFlag('chars', args?.maxCharsPerMatch),
    formatOptionalStringListFlag('globs', args?.globs),
    args?.noIgnore ? 'noIgnore' : undefined,
    args?.visibleOnly ? 'visibleOnly' : undefined,
  ]
    .filter((flag): flag is string => flag !== undefined)
    .join(', ');
}

function formatOptionalNumberFlag(label: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${label} ${value}`;
}
