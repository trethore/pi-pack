import {
  LIMIT_RANGE,
  MAX_CHARS_PER_MATCH_RANGE,
  parseIntegerInRange,
  type IntegerRange,
} from '#pi-bash-commands-cli/shared/limits';

const FIND_DEFAULT_LIMIT_ENV = 'PI_BASH_COMMANDS_FIND_DEFAULT_LIMIT';
const GREP_DEFAULT_LIMIT_ENV = 'PI_BASH_COMMANDS_GREP_DEFAULT_LIMIT';
const GREP_DEFAULT_LIMIT_PER_FILE_ENV = 'PI_BASH_COMMANDS_GREP_DEFAULT_LIMIT_PER_FILE';
const GREP_DEFAULT_MAX_CHARS_PER_MATCH_ENV = 'PI_BASH_COMMANDS_GREP_DEFAULT_MAX_CHARS_PER_MATCH';

export interface FindCliDefaults {
  defaultLimit: number;
}

export interface GrepCliDefaults {
  defaultLimit: number;
  defaultLimitPerFile?: number;
  defaultMaxCharsPerMatch: number;
}

export const DEFAULT_FIND_CLI_DEFAULTS: FindCliDefaults = {
  defaultLimit: 100,
};

export const DEFAULT_GREP_CLI_DEFAULTS: GrepCliDefaults = {
  defaultLimit: 200,
  defaultMaxCharsPerMatch: 200,
};

export function createFindCliEnvironment(defaults: FindCliDefaults): Record<string, string> {
  return {
    [FIND_DEFAULT_LIMIT_ENV]: String(defaults.defaultLimit),
  };
}

export function createGrepCliEnvironment(defaults: GrepCliDefaults): Record<string, string> {
  const env: Record<string, string> = {
    [GREP_DEFAULT_LIMIT_ENV]: String(defaults.defaultLimit),
    [GREP_DEFAULT_MAX_CHARS_PER_MATCH_ENV]: String(defaults.defaultMaxCharsPerMatch),
  };
  if (defaults.defaultLimitPerFile !== undefined) {
    env[GREP_DEFAULT_LIMIT_PER_FILE_ENV] = String(defaults.defaultLimitPerFile);
  }
  return env;
}

export function readFindCliDefaults(env: NodeJS.ProcessEnv): FindCliDefaults {
  return {
    defaultLimit: readInteger(env[FIND_DEFAULT_LIMIT_ENV], DEFAULT_FIND_CLI_DEFAULTS.defaultLimit, LIMIT_RANGE),
  };
}

export function readGrepCliDefaults(env: NodeJS.ProcessEnv): GrepCliDefaults {
  return {
    defaultLimit: readInteger(env[GREP_DEFAULT_LIMIT_ENV], DEFAULT_GREP_CLI_DEFAULTS.defaultLimit, LIMIT_RANGE),
    defaultLimitPerFile: readOptionalInteger(env[GREP_DEFAULT_LIMIT_PER_FILE_ENV], LIMIT_RANGE),
    defaultMaxCharsPerMatch: readInteger(
      env[GREP_DEFAULT_MAX_CHARS_PER_MATCH_ENV],
      DEFAULT_GREP_CLI_DEFAULTS.defaultMaxCharsPerMatch,
      MAX_CHARS_PER_MATCH_RANGE
    ),
  };
}

function readInteger(value: string | undefined, fallback: number, range: IntegerRange): number {
  return readOptionalInteger(value, range) ?? fallback;
}

function readOptionalInteger(value: string | undefined, range: IntegerRange): number | undefined {
  if (value === undefined) return undefined;
  return parseIntegerInRange(value, range);
}
