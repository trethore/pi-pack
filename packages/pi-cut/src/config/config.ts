import { existsSync, readFileSync } from 'node:fs';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { getConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  type LoadedConfig,
  type PartialPiCutConfig,
  type PiCutConfig,
} from '#src/config/schema.js';

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const mergedConfig = { ...defaultConfig, lineTruncation: { ...defaultConfig.lineTruncation } };

  for (const configPath of getConfigPaths(cwd)) {
    const parsedConfig = readConfigFile(configPath, errors);
    if (parsedConfig) mergeConfig(mergedConfig, parsedConfig, configPath, errors);
  }

  return { config: mergedConfig, errors };
}

function readConfigFile(configPath: string, errors: string[]): PartialPiCutConfig | undefined {
  if (!existsSync(configPath)) return undefined;

  const parseErrors: ParseError[] = [];
  const contents = readFileSync(configPath, 'utf8');
  const parsed = parse(contents, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as unknown;

  if (parseErrors.length > 0) {
    errors.push(formatParseErrors(configPath, parseErrors));
    return undefined;
  }

  if (!isRecord(parsed)) {
    errors.push(`pi-cut config ignored: ${configPath} must contain a JSON object.`);
    return undefined;
  }

  return parsed;
}

function mergeConfig(
  target: PiCutConfig,
  source: PartialPiCutConfig,
  configPath: string,
  errors: string[]
) {
  mergeEnabled(target, source, configPath, errors);
  mergeLineTruncation(target, source, configPath, errors);
}

function mergeEnabled(
  target: PiCutConfig,
  source: PartialPiCutConfig,
  configPath: string,
  errors: string[]
) {
  if (source.enabled === undefined) return;

  if (typeof source.enabled === 'boolean') {
    target.enabled = source.enabled;
    return;
  }

  errors.push(`pi-cut config ignored invalid enabled value in ${configPath}; expected boolean.`);
}

function mergeLineTruncation(
  target: PiCutConfig,
  source: PartialPiCutConfig,
  configPath: string,
  errors: string[]
) {
  if (source.lineTruncation === undefined) return;

  if (!isRecord(source.lineTruncation)) {
    errors.push(
      `pi-cut config ignored invalid lineTruncation value in ${configPath}; expected object.`
    );
    return;
  }

  if (source.lineTruncation.enabled !== undefined) {
    if (typeof source.lineTruncation.enabled === 'boolean') {
      target.lineTruncation.enabled = source.lineTruncation.enabled;
    } else {
      errors.push(
        `pi-cut config ignored invalid lineTruncation.enabled value in ${configPath}; expected boolean.`
      );
    }
  }

  if (source.lineTruncation.maxChars !== undefined) {
    if (isPositiveInteger(source.lineTruncation.maxChars)) {
      target.lineTruncation.maxChars = source.lineTruncation.maxChars;
    } else {
      errors.push(
        `pi-cut config ignored invalid lineTruncation.maxChars value in ${configPath}; expected positive integer.`
      );
    }
  }
}

function formatParseErrors(configPath: string, parseErrors: ParseError[]): string {
  const messages = parseErrors.map(
    (error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`
  );
  return `pi-cut config ignored: ${configPath} has JSONC parse errors: ${messages.join(', ')}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
