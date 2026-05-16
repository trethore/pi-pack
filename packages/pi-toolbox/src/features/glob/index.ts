import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { ExtensionAPI, Theme, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

import type { GlobToolConfig } from '#src/config/schema.js';
import { formatGlobResult } from '#src/features/glob/format.js';
import {
  formatStringList,
  normalizeOptionalStringList,
  normalizeRequiredStringList,
} from '#src/utils/string-list.js';
import { formatTextToolResult, hasZeroCountDetails } from '#src/utils/tool-results.js';
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
    patterns: Record<string, unknown>;
    paths: Record<string, unknown>;
    limit: { description: string } & Record<string, unknown>;
    noIgnore: Record<string, unknown>;
    hidden: Record<string, unknown>;
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
  pi.on('tool_result', (event) => {
    if (event.toolName !== GLOB_TOOL_DEFINITION.name || !hasZeroCountDetails(event.details)) {
      return;
    }

    return { isError: true };
  });
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
      await assertDirectories(cwd, preparedParams.paths);

      const result = await runner({
        cwd,
        patterns: preparedParams.patterns,
        paths: preparedParams.paths,
        limit: preparedParams.limit,
        noIgnore: preparedParams.noIgnore,
        hidden: preparedParams.hidden,
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
      const text = (context.lastComponent as Text | undefined) ?? new Text('', 0, 0);
      text.setText(formatGlobCall(args, theme));
      return text;
    },
    renderResult(result, options, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text('', 0, 0);
      text.setText(formatTextToolResult(result, options, theme));
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
    patterns: normalizeRequiredStringList(params.patterns, {
      name: 'patterns',
      toolName: 'glob',
    }),
    paths: normalizeOptionalStringList(params.paths, ['.']),
    limit: params.limit ?? config.defaultLimit,
    noIgnore: params.noIgnore ?? false,
    hidden: params.hidden ?? false,
  };
}

function resolveSearchPath(cwd: string, searchPath: string): string {
  return path.resolve(cwd, searchPath);
}

async function assertDirectories(cwd: string, searchPaths: readonly string[]): Promise<void> {
  await Promise.all(
    searchPaths.map((searchPath) => assertDirectory(resolveSearchPath(cwd, searchPath)))
  );
}

async function assertDirectory(searchPath: string): Promise<void> {
  let stats;
  try {
    stats = await stat(searchPath);
  } catch (error) {
    throw new Error(`glob failed: search path does not exist: ${searchPath}`, { cause: error });
  }

  if (!stats.isDirectory()) {
    throw new Error(`glob failed: search path is not a directory: ${searchPath}`);
  }
}

function formatGlobCall(args: GlobParameters | undefined, theme: Theme): string {
  const patterns = formatStringList(args?.patterns, '...');
  const searchPaths = formatStringList(args?.paths, '.');
  const flags = formatGlobFlags(args);
  const suffix = flags ? theme.fg('toolOutput', ` (${flags})`) : '';

  return [
    theme.fg('toolTitle', theme.bold('glob')),
    ' ',
    theme.fg('accent', patterns),
    theme.fg('toolOutput', ` in ${searchPaths}`),
    suffix,
  ].join('');
}

function formatGlobFlags(args: GlobParameters | undefined): string {
  const flags: string[] = [];
  if (args?.limit !== undefined) flags.push(`limit ${args.limit}`);
  if (args?.noIgnore) flags.push('noIgnore');
  if (args?.hidden) flags.push('hidden');
  return flags.join(', ');
}
