import type { ExtensionAPI, Theme, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { GlobToolConfig } from '#src/config/schema.js';
import { formatGlobResult } from '#src/features/glob/format.js';
import {
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
  runRipgrepGlob,
  type RipgrepGlobResult,
  type RunRipgrepGlobOptions,
} from '#src/features/glob/ripgrep.js';

const GLOB_TOOL_DEFINITION = readGlobDefinition();

interface GlobParameters {
  patterns: string[];
  paths?: string[];
  limit?: number;
  noIgnore?: boolean;
  visibleOnly?: boolean;
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
    patterns: Record<string, unknown>;
    paths: Record<string, unknown>;
    limit: { description: string } & Record<string, unknown>;
    noIgnore: Record<string, unknown>;
    visibleOnly: Record<string, unknown>;
  };
}

type GlobParametersSchema = ReturnType<typeof createGlobParametersSchema>;
type GlobRunner = (options: RunRipgrepGlobOptions) => Promise<RipgrepGlobResult>;

export interface GlobToolDetails {
  paths: string[];
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
  registerZeroCountToolResultError(pi, GLOB_TOOL_DEFINITION.name);
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
      await assertSearchPaths(cwd, preparedParams.paths, {
        toolName: 'glob',
        requireDirectory: true,
      });

      const result = await runner({
        cwd,
        patterns: preparedParams.patterns,
        paths: preparedParams.paths,
        limit: preparedParams.limit,
        noIgnore: preparedParams.noIgnore,
        visibleOnly: preparedParams.visibleOnly,
        signal,
      });

      return {
        content: [
          {
            type: 'text',
            text: formatGlobResult({
              paths: preparedParams.paths,
              files: result.files,
              limited: result.limited,
            }),
          },
        ],
        details: {
          paths: preparedParams.paths,
          count: result.files.length,
          limited: result.limited,
        },
      };
    },
    renderCall(args, theme, context) {
      return renderTextCall(args, theme, context, formatGlobCall);
    },
    renderResult(result, options, theme, context) {
      return renderTextResult(result, options, theme, context);
    },
  };
}

function readGlobDefinition(): GlobDefinition {
  return readJsonDefinition(new URL('glob-definition.json', import.meta.url));
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
  return cloneJsonSchema(parameters);
}

function prepareGlobParameters(
  params: GlobParameters,
  config: GlobToolConfig
): Required<GlobParameters> {
  return {
    patterns: normalizeRequiredStringList(params.patterns, {
      name: 'patterns',
      toolName: 'glob',
    }),
    paths: normalizeOptionalStringList(params.paths, ['.']),
    limit: params.limit ?? config.defaultLimit,
    noIgnore: params.noIgnore ?? false,
    visibleOnly: params.visibleOnly ?? false,
  };
}

function formatGlobCall(args: GlobParameters | undefined, theme: Theme): string {
  const patterns = formatStringList(args?.patterns, '...');
  const searchPaths = formatStringList(args?.paths, '.');
  const flags = formatGlobFlags(args);
  return formatToolCall(theme, {
    toolName: 'glob',
    query: patterns,
    paths: searchPaths,
    flags,
  });
}

function formatGlobFlags(args: GlobParameters | undefined): string {
  const flags: string[] = [];
  if (args?.limit !== undefined) flags.push(`limit ${args.limit}`);
  if (args?.noIgnore) flags.push('noIgnore');
  if (args?.visibleOnly) flags.push('visibleOnly');
  return flags.join(', ');
}
