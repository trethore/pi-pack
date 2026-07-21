import type { ExtensionAPI, Theme, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';

import type { GrepToolConfig } from '#src/config/schema.js';
import { TOOL_NAME } from '#src/features/grep/constants.js';
import { createGrepDisplay, formatGrepDisplay } from '#src/features/grep/format.js';
import {
  formatOptionalStringListFlag,
  formatStringList,
  normalizeOptionalPathList,
  normalizeOptionalStringList,
  normalizeRequiredStringList,
} from '#src/utils/string-list.js';
import { assertSearchPaths, createTextToolDefinition, formatToolCall } from '#src/utils/tool-definition.js';
import { SUMMARY_ONLY_COLLAPSED_RESULT_LINES } from '#src/utils/tool-results.js';
import {
  createNoIgnoreSchema,
  createSearchDepthSchema,
  createSearchPathsSchema,
  createVisibleOnlySchema,
} from '#src/utils/search-schema.js';
import { runRipgrepGrep, type RipgrepGrepResult, type RunRipgrepGrepOptions } from '#src/features/grep/ripgrep.js';

const GREP_TOOL_DEFINITION = {
  name: TOOL_NAME,
  label: TOOL_NAME,
  description: "Search file contents using ripgrep: rg --json -n -e '<regex>' -g '<glob>' <path(s)>.",
  promptSnippet: 'Search file contents by regex(es)',
  promptGuidelines: [
    'Use `grep` for fast content search when you know the text or regular expressions to find.',
    '`grep` always excludes `.git` internals from results.',
  ],
};

type GrepParameters = Static<ReturnType<typeof createGrepParametersSchema>>;

interface PreparedGrepParameters extends Required<Omit<GrepParameters, 'limitPerFile' | 'depth'>> {
  limitPerFile?: number;
  depth?: number;
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

export function registerGrepTool(pi: ExtensionAPI, config: GrepToolConfig): void {
  pi.registerTool(createGrepToolDefinition(config));
}

export function createGrepToolDefinition(
  config: GrepToolConfig,
  options: GrepToolOptions = {}
): ToolDefinition<GrepParametersSchema, GrepToolDetails | undefined> {
  const runner = options.runner ?? runRipgrepGrep;
  const parameters = createGrepParametersSchema(config);

  return createTextToolDefinition<GrepParametersSchema, GrepToolDetails | undefined>({
    metadata: GREP_TOOL_DEFINITION,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = options.cwd ?? ctx.cwd;
      const preparedParams = prepareGrepParameters(params, config);
      await assertSearchPaths(cwd, preparedParams.paths, { toolName: TOOL_NAME });

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
    formatCall: formatGrepCall,
    collapsedResultLines: SUMMARY_ONLY_COLLAPSED_RESULT_LINES,
  });
}

function createGrepParametersSchema(config: GrepToolConfig) {
  return Type.Object(
    {
      regexes: Type.Array(Type.String(), {
        minItems: 1,
        description:
          'Ripgrep-compatible regex pattern(s) to search for. Provide one or more regexes; each regex is passed with `-e` and multiple regexes use OR semantics. Searches are line-oriented; inline flags like `(?i)` can be used.',
      }),
      paths: createSearchPathsSchema(
        'Path(s) to search in. Provide one or more directories or files. If omitted, the current working directory is used.'
      ),
      globs: Type.Optional(
        Type.Array(Type.String(), {
          minItems: 1,
          description:
            'Glob filter(s) passed with `-g`. Prefix exclusions with `!`. If omitted, no glob filters are applied.',
        })
      ),
      limit: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 1000,
          description: `Maximum number of matching lines to return globally. If omitted, defaults to ${config.defaultLimit}.`,
        })
      ),
      limitPerFile: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 1000,
          description: `Maximum number of matching lines to return per file. If omitted, defaults to ${formatDefaultLimitPerFileValue(config.defaultLimitPerFile)}.`,
        })
      ),
      depth: createSearchDepthSchema(),
      maxCharsPerMatch: Type.Optional(
        Type.Integer({
          minimum: 100,
          maximum: 2000,
          description: `Maximum number of characters to show per matching line. If omitted, defaults to ${config.defaultMaxCharsPerMatch}.`,
        })
      ),
      noIgnore: createNoIgnoreSchema(),
      visibleOnly: createVisibleOnlySchema(),
    },
    { additionalProperties: false }
  );
}

function formatDefaultLimitPerFileValue(defaultLimitPerFile: number | undefined): string {
  return defaultLimitPerFile === undefined ? 'no per-file limit' : String(defaultLimitPerFile);
}

function prepareGrepParameters(params: GrepParameters, config: GrepToolConfig): PreparedGrepParameters {
  return {
    regexes: normalizeRequiredStringList(params.regexes, {
      name: 'regexes',
      toolName: TOOL_NAME,
    }),
    paths: normalizeOptionalPathList(params.paths, ['.']),
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
    toolName: TOOL_NAME,
    query: regexes,
    paths: searchPaths,
    flags,
  });
}

function formatGrepFlags(args: GrepParameters | undefined): string {
  return collectFlags([
    ...formatNumberFlags(args),
    formatOptionalStringListFlag('globs', args?.globs),
    formatBooleanFlag('noIgnore', args?.noIgnore),
    formatBooleanFlag('visibleOnly', args?.visibleOnly),
  ]);
}

function formatNumberFlags(args: GrepParameters | undefined): Array<string | undefined> {
  return [
    ['limit', args?.limit],
    ['limit/file', args?.limitPerFile],
    ['depth', args?.depth],
    ['chars', args?.maxCharsPerMatch],
  ].map(([label, value]) => formatOptionalNumberFlag(String(label), value as number | undefined));
}

function formatBooleanFlag(label: string, value: boolean | undefined): string | undefined {
  return value ? label : undefined;
}

function collectFlags(flags: Array<string | undefined>): string {
  return flags.filter((flag): flag is string => flag !== undefined).join(', ');
}

function formatOptionalNumberFlag(label: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${label} ${value}`;
}
