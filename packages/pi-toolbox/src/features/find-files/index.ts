import type { ExtensionAPI, Theme, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { FindFilesToolConfig } from '#src/config/schema.js';
import { countFindFiles, formatFindFilesResult } from '#src/features/find-files/format.js';
import { formatStringList, normalizeOptionalStringList } from '#src/utils/string-list.js';
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
  runRipgrepFindFiles,
  type RipgrepFindFilesResult,
  type RunRipgrepFindFilesOptions,
} from '#src/features/find-files/ripgrep.js';

const FIND_FILES_TOOL_DEFINITION = readFindFilesDefinition();

interface FindFilesParameters {
  patterns?: string[];
  paths?: string[];
  limit?: number;
  depth?: number;
  noIgnore?: boolean;
  visibleOnly?: boolean;
}

interface PreparedFindFilesParameters extends Required<
  Omit<FindFilesParameters, 'depth' | 'patterns'>
> {
  patterns: string[];
  depth?: number;
}

interface FindFilesDefinition {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: FindFilesParametersJsonSchema;
}

interface FindFilesParametersJsonSchema {
  type: 'object';
  additionalProperties: boolean;
  required?: string[];
  properties: {
    patterns: Record<string, unknown>;
    paths: Record<string, unknown>;
    limit: { description: string } & Record<string, unknown>;
    depth: Record<string, unknown>;
    noIgnore: Record<string, unknown>;
    visibleOnly: Record<string, unknown>;
  };
}

type FindFilesParametersSchema = ReturnType<typeof createFindFilesParametersSchema>;
type FindFilesRunner = (options: RunRipgrepFindFilesOptions) => Promise<RipgrepFindFilesResult>;

export interface FindFilesToolDetails {
  paths: string[];
  count: number;
  limited: boolean;
}

export interface FindFilesToolOptions {
  cwd?: string;
  runner?: FindFilesRunner;
}

export function registerFindFilesTool(
  pi: ExtensionAPI,
  config: { findFiles: FindFilesToolConfig }
): void {
  if (!config.findFiles.enabled) return;
  pi.registerTool(createFindFilesToolDefinition(config.findFiles));
  registerZeroCountToolResultError(pi, FIND_FILES_TOOL_DEFINITION.name);
}

export function createFindFilesToolDefinition(
  config: FindFilesToolConfig,
  options: FindFilesToolOptions = {}
): ToolDefinition<FindFilesParametersSchema, FindFilesToolDetails | undefined> {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? runRipgrepFindFiles;
  const parameters = createFindFilesParametersSchema(config.defaultLimit);

  return {
    name: FIND_FILES_TOOL_DEFINITION.name,
    label: FIND_FILES_TOOL_DEFINITION.label,
    description: FIND_FILES_TOOL_DEFINITION.description,
    promptSnippet: FIND_FILES_TOOL_DEFINITION.promptSnippet,
    promptGuidelines: FIND_FILES_TOOL_DEFINITION.promptGuidelines,
    parameters,
    async execute(_toolCallId, params, signal) {
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

      const count = countFindFiles(result.files);

      return {
        content: [
          {
            type: 'text',
            text: formatFindFilesResult({
              paths: preparedParams.paths,
              files: result.files,
              limited: result.limited,
            }),
          },
        ],
        details: {
          paths: preparedParams.paths,
          count,
          limited: result.limited,
        },
      };
    },
    renderCall(args, theme, context) {
      return renderTextCall(args, theme, context, formatFindFilesCall);
    },
    renderResult(result, options, theme, context) {
      return renderTextResult(result, options, theme, context);
    },
  };
}

function readFindFilesDefinition(): FindFilesDefinition {
  return readJsonDefinition(new URL('find-files-definition.json', import.meta.url));
}

function createFindFilesParametersSchema(defaultLimit: number) {
  const parameters = cloneParametersSchema(FIND_FILES_TOOL_DEFINITION.parameters);
  parameters.properties.limit.description = parameters.properties.limit.description.replace(
    '{{defaultLimit}}',
    String(defaultLimit)
  );
  return Type.Unsafe<FindFilesParameters>(parameters);
}

function cloneParametersSchema(
  parameters: FindFilesParametersJsonSchema
): FindFilesParametersJsonSchema {
  return cloneJsonSchema(parameters);
}

function prepareFindFilesParameters(
  params: FindFilesParameters,
  config: FindFilesToolConfig
): PreparedFindFilesParameters {
  return {
    patterns: normalizeOptionalStringList(params.patterns, []),
    paths: normalizeOptionalStringList(params.paths, ['.']),
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
