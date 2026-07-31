import { parseArgs } from 'node:util';

import {
  DEFAULT_FIND_LIMIT,
  DEFAULT_GREP_LIMIT,
  DEFAULT_MAX_CHARS_PER_MATCH,
} from '#pi-bash-commands-cli/shared/constants';

export interface FindCliOptions {
  patterns: string[];
  paths: string[];
  limit: number;
  depth?: number;
  noIgnore: boolean;
  visibleOnly: boolean;
}

export interface GrepCliOptions {
  regexes: string[];
  paths: string[];
  globs: string[];
  limit: number;
  limitPerFile?: number;
  depth?: number;
  maxCharsPerMatch: number;
  noIgnore: boolean;
  visibleOnly: boolean;
}

export type ParsedCliOptions<T> = { help: true } | { help: false; options: T };

const SEARCH_OPTIONS = {
  paths: { type: 'string', multiple: true },
  limit: { type: 'string' },
  depth: { type: 'string' },
  'no-ignore': { type: 'boolean' },
  'visible-only': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

export function parseFindCliOptions(args: readonly string[]): ParsedCliOptions<FindCliOptions> {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      ...SEARCH_OPTIONS,
      patterns: { type: 'string', multiple: true },
    },
  });

  if (parsed.values.help) return { help: true };

  return {
    help: false,
    options: {
      patterns: normalizeStringList(parsed.values.patterns),
      paths: normalizePathList(parsed.values.paths),
      limit: parseIntegerOption('limit', parsed.values.limit, {
        defaultValue: DEFAULT_FIND_LIMIT,
        minimum: 1,
        maximum: 1000,
      }),
      depth: parseOptionalIntegerOption('depth', parsed.values.depth, { minimum: 1 }),
      noIgnore: parsed.values['no-ignore'] ?? false,
      visibleOnly: parsed.values['visible-only'] ?? false,
    },
  };
}

export function parseGrepCliOptions(args: readonly string[]): ParsedCliOptions<GrepCliOptions> {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      ...SEARCH_OPTIONS,
      regexes: { type: 'string', multiple: true },
      globs: { type: 'string', multiple: true },
      'limit-per-file': { type: 'string' },
      'max-chars-per-match': { type: 'string' },
    },
  });

  if (parsed.values.help) return { help: true };

  const regexes = normalizeStringList(parsed.values.regexes);
  if (regexes.length === 0) throw new Error('regexes must contain at least one non-empty string');

  return {
    help: false,
    options: {
      regexes,
      paths: normalizePathList(parsed.values.paths),
      globs: normalizeStringList(parsed.values.globs),
      limit: parseIntegerOption('limit', parsed.values.limit, {
        defaultValue: DEFAULT_GREP_LIMIT,
        minimum: 1,
        maximum: 1000,
      }),
      limitPerFile: parseOptionalIntegerOption('limit-per-file', parsed.values['limit-per-file'], {
        minimum: 1,
        maximum: 1000,
      }),
      depth: parseOptionalIntegerOption('depth', parsed.values.depth, { minimum: 1 }),
      maxCharsPerMatch: parseIntegerOption('max-chars-per-match', parsed.values['max-chars-per-match'], {
        defaultValue: DEFAULT_MAX_CHARS_PER_MATCH,
        minimum: 100,
        maximum: 2000,
      }),
      noIgnore: parsed.values['no-ignore'] ?? false,
      visibleOnly: parsed.values['visible-only'] ?? false,
    },
  };
}

function normalizePathList(values: readonly string[] | undefined): string[] {
  const paths = normalizeList(values, (value) => {
    const normalized = value.trim();
    return normalized.startsWith('@') ? normalized.slice(1) : normalized;
  });
  return paths.length > 0 ? paths : ['.'];
}

function normalizeStringList(values: readonly string[] | undefined): string[] {
  return normalizeList(values, (value) => value.trim());
}

function normalizeList(values: readonly string[] | undefined, normalize: (value: string) => string): string[] {
  if (values === undefined) return [];
  return [...new Set(values.map((value) => normalize(value)).filter(Boolean))];
}

function parseIntegerOption(
  name: string,
  value: string | undefined,
  options: { defaultValue: number; minimum: number; maximum?: number }
): number {
  return parseOptionalIntegerOption(name, value, options) ?? options.defaultValue;
}

function parseOptionalIntegerOption(
  name: string,
  value: string | undefined,
  options: { minimum: number; maximum?: number }
): number | undefined {
  if (value === undefined) return undefined;

  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < options.minimum ||
    (options.maximum !== undefined && parsed > options.maximum)
  ) {
    const range =
      options.maximum === undefined
        ? `at least ${options.minimum}`
        : `between ${options.minimum} and ${options.maximum}`;
    throw new Error(`--${name} must be an integer ${range}`);
  }
  return parsed;
}
