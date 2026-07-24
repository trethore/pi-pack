import type { ExtensionAPI, Theme, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';

import type { FindFilesToolConfig } from '#src/config/schema.js';
import { TOOL_NAME } from '#src/features/find-files/constants.js';
import { createFindFilesDisplay, formatFindFilesDisplay } from '#src/features/find-files/format.js';
import { FIND_FILES_PROMPT } from '#src/prompts.js';
import { formatStringList, normalizeOptionalPathList, normalizeOptionalStringList } from '#src/utils/string-list.js';
import {
  createNoIgnoreSchema,
  createSearchDepthSchema,
  createSearchPathsSchema,
  createVisibleOnlySchema,
} from '#src/utils/search-schema.js';
import { assertSearchPaths, createTextToolDefinition, formatToolCall } from '#src/utils/tool-definition.js';
import { SUMMARY_ONLY_COLLAPSED_RESULT_LINES } from '#src/utils/tool-results.js';
import { limitAndPersistToolOutput, type ToolOutputTruncationDetails } from '#src/utils/output-limits.js';
import {
  runRipgrepFindFiles,
  type RipgrepFindFilesResult,
  type RunRipgrepFindFilesOptions,
} from '#src/features/find-files/ripgrep.js';

const FIND_FILES_TOOL_DEFINITION = {
  name: TOOL_NAME,
  label: TOOL_NAME,
  ...FIND_FILES_PROMPT.tool,
};

type FindFilesParameters = Static<ReturnType<typeof createFindFilesParametersSchema>>;

interface PreparedFindFilesParameters extends Required<Omit<FindFilesParameters, 'depth' | 'patterns'>> {
  patterns: string[];
  depth?: number;
}

type FindFilesParametersSchema = ReturnType<typeof createFindFilesParametersSchema>;
type FindFilesRunner = (options: RunRipgrepFindFilesOptions) => Promise<RipgrepFindFilesResult>;

export interface FindFilesToolDetails extends ToolOutputTruncationDetails {
  paths: string[];
  count: number;
  limited: boolean;
}

export interface FindFilesToolOptions {
  cwd?: string;
  runner?: FindFilesRunner;
}

export function registerFindFilesTool(pi: ExtensionAPI, config: FindFilesToolConfig): void {
  pi.registerTool(createFindFilesToolDefinition(config));
}

export function createFindFilesToolDefinition(
  config: FindFilesToolConfig,
  options: FindFilesToolOptions = {}
): ToolDefinition<FindFilesParametersSchema, FindFilesToolDetails | undefined> {
  const runner = options.runner ?? runRipgrepFindFiles;
  const parameters = createFindFilesParametersSchema(config.defaultLimit);

  return createTextToolDefinition<FindFilesParametersSchema, FindFilesToolDetails | undefined>({
    metadata: FIND_FILES_TOOL_DEFINITION,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = options.cwd ?? ctx.cwd;
      const preparedParams = prepareFindFilesParameters(params, config);
      await assertSearchPaths(cwd, preparedParams.paths, {
        toolName: FIND_FILES_TOOL_DEFINITION.name,
        requireDirectory: true,
      });

      const result = await runner({
        cwd,
        patterns: preparedParams.patterns,
        paths: preparedParams.paths,
        limit: preparedParams.limit,
        depth: preparedParams.depth,
        noIgnore: preparedParams.noIgnore,
        visibleOnly: preparedParams.visibleOnly,
        signal,
      });

      const display = createFindFilesDisplay({
        paths: preparedParams.paths,
        files: result.files,
        limited: result.limited,
      });
      const output = await limitAndPersistToolOutput(formatFindFilesDisplay(display), TOOL_NAME);

      return {
        content: [
          {
            type: 'text',
            text: output.text,
          },
        ],
        details: {
          paths: preparedParams.paths,
          count: display.count,
          limited: result.limited || output.details !== undefined,
          ...output.details,
        },
      };
    },
    formatCall: formatFindFilesCall,
    collapsedResultLines: SUMMARY_ONLY_COLLAPSED_RESULT_LINES,
  });
}

function createFindFilesParametersSchema(defaultLimit: number) {
  return Type.Object(
    {
      patterns: Type.Optional(
        Type.Array(Type.String(), {
          minItems: 1,
          description: FIND_FILES_PROMPT.parameters.patterns,
        })
      ),
      paths: createSearchPathsSchema(FIND_FILES_PROMPT.parameters.paths),
      limit: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 1000,
          description: FIND_FILES_PROMPT.parameters.limit(defaultLimit),
        })
      ),
      depth: createSearchDepthSchema(),
      noIgnore: createNoIgnoreSchema(),
      visibleOnly: createVisibleOnlySchema(),
    },
    { additionalProperties: false }
  );
}

function prepareFindFilesParameters(
  params: FindFilesParameters,
  config: FindFilesToolConfig
): PreparedFindFilesParameters {
  return {
    patterns: normalizeOptionalStringList(params.patterns, []),
    paths: normalizeOptionalPathList(params.paths, ['.']),
    limit: params.limit ?? config.defaultLimit,
    depth: params.depth,
    noIgnore: params.noIgnore ?? false,
    visibleOnly: params.visibleOnly ?? false,
  };
}

function formatFindFilesCall(args: FindFilesParameters | undefined, theme: Theme): string {
  const patterns = formatStringList(args?.patterns, '...');
  const searchPaths = formatStringList(args?.paths, '.');
  const flags = formatFindFilesFlags(args);
  return formatToolCall(theme, {
    toolName: FIND_FILES_TOOL_DEFINITION.name,
    query: patterns,
    paths: searchPaths,
    flags,
  });
}

function formatFindFilesFlags(args: FindFilesParameters | undefined): string {
  const flags: string[] = [];
  if (args?.limit !== undefined) flags.push(`limit ${args.limit}`);
  if (args?.depth !== undefined) flags.push(`depth ${args.depth}`);
  if (args?.noIgnore) flags.push('noIgnore');
  if (args?.visibleOnly) flags.push('visibleOnly');
  return flags.join(', ');
}
