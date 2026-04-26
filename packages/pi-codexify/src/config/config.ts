import { existsSync, readFileSync } from 'node:fs';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { getConfigPaths } from '#src/config/locations.js';
import {
  codexReasoningSummaryValues,
  codexVerbosityValues,
  defaultConfig,
  type CodexReasoningSummary,
  type CodexVerbosity,
  type LoadedConfig,
  type PartialPiCodexifyConfig,
  type PiCodexifyConfig,
} from '#src/config/schema.js';
import { isRecord } from '#src/shared/object.js';

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const mergedConfig = cloneDefaultConfig();

  for (const configPath of getConfigPaths(cwd)) {
    const parsedConfig = readConfigFile(configPath, errors);
    if (parsedConfig) mergeConfig(mergedConfig, parsedConfig, configPath, errors);
  }

  return { config: mergedConfig, errors };
}

function cloneDefaultConfig(): PiCodexifyConfig {
  return {
    ...defaultConfig,
    codex: { ...defaultConfig.codex },
    usage: { ...defaultConfig.usage },
    webSearch: { ...defaultConfig.webSearch },
  };
}

function readConfigFile(configPath: string, errors: string[]): PartialPiCodexifyConfig | undefined {
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
    errors.push(`pi-codexify config ignored: ${configPath} must contain a JSON object.`);
    return undefined;
  }

  return parsed;
}

function mergeConfig(
  target: PiCodexifyConfig,
  source: PartialPiCodexifyConfig,
  configPath: string,
  errors: string[]
) {
  if (source.enabled !== undefined) {
    const enabled = readBooleanField(source.enabled, 'enabled', configPath, errors);
    if (enabled !== undefined) target.enabled = enabled;
  }

  mergeCodexConfig(target, source, configPath, errors);
  mergeUsageConfig(target, source, configPath, errors);
  mergeWebSearchConfig(target, source, configPath, errors);
}

function mergeCodexConfig(
  target: PiCodexifyConfig,
  source: PartialPiCodexifyConfig,
  configPath: string,
  errors: string[]
) {
  if (source.codex === undefined) return;

  if (!isRecord(source.codex)) {
    errors.push(
      `pi-codexify config ignored invalid codex value in ${configPath}; expected object.`
    );
    return;
  }

  if (source.codex.enabled !== undefined) {
    const enabled = readBooleanField(source.codex.enabled, 'codex.enabled', configPath, errors);
    if (enabled !== undefined) target.codex.enabled = enabled;
  }

  if (source.codex.verbosity !== undefined) {
    if (source.codex.verbosity === null) {
      target.codex.verbosity = undefined;
    } else if (isCodexVerbosity(source.codex.verbosity)) {
      target.codex.verbosity = source.codex.verbosity;
    } else {
      errors.push(
        `pi-codexify config ignored invalid codex.verbosity value in ${configPath}; expected low, medium, high, or null.`
      );
    }
  }

  mergeReasoningSummaryConfig(target, source.codex, configPath, errors);
}

function mergeReasoningSummaryConfig(
  target: PiCodexifyConfig,
  codexConfig: Record<string, unknown>,
  configPath: string,
  errors: string[]
) {
  if (codexConfig.reasoningSummary === undefined) return;

  if (codexConfig.reasoningSummary === null) {
    target.codex.reasoningSummary = undefined;
    return;
  }

  if (isCodexReasoningSummary(codexConfig.reasoningSummary)) {
    target.codex.reasoningSummary = codexConfig.reasoningSummary;
    return;
  }

  errors.push(
    `pi-codexify config ignored invalid codex.reasoningSummary value in ${configPath}; expected auto, concise, detailed, or null.`
  );
}

function mergeUsageConfig(
  target: PiCodexifyConfig,
  source: PartialPiCodexifyConfig,
  configPath: string,
  errors: string[]
) {
  if (source.usage === undefined) return;

  if (!isRecord(source.usage)) {
    errors.push(
      `pi-codexify config ignored invalid usage value in ${configPath}; expected object.`
    );
    return;
  }

  if (source.usage.enabled !== undefined) {
    const enabled = readBooleanField(source.usage.enabled, 'usage.enabled', configPath, errors);
    if (enabled !== undefined) target.usage.enabled = enabled;
  }
}

function mergeWebSearchConfig(
  target: PiCodexifyConfig,
  source: PartialPiCodexifyConfig,
  configPath: string,
  errors: string[]
) {
  if (source.webSearch === undefined) return;

  if (!isRecord(source.webSearch)) {
    errors.push(
      `pi-codexify config ignored invalid webSearch value in ${configPath}; expected object.`
    );
    return;
  }

  if (source.webSearch.enabled !== undefined) {
    const enabled = readBooleanField(
      source.webSearch.enabled,
      'webSearch.enabled',
      configPath,
      errors
    );
    if (enabled !== undefined) target.webSearch.enabled = enabled;
  }
}

function readBooleanField(
  value: unknown,
  label: string,
  configPath: string,
  errors: string[]
): boolean | undefined {
  if (typeof value === 'boolean') return value;

  errors.push(
    `pi-codexify config ignored invalid ${label} value in ${configPath}; expected boolean.`
  );
  return undefined;
}

function isCodexVerbosity(value: unknown): value is CodexVerbosity {
  return codexVerbosityValues.includes(value as CodexVerbosity);
}

function isCodexReasoningSummary(value: unknown): value is CodexReasoningSummary {
  return codexReasoningSummaryValues.includes(value as CodexReasoningSummary);
}

function formatParseErrors(configPath: string, parseErrors: ParseError[]): string {
  const messages = parseErrors.map(
    (error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`
  );
  return `pi-codexify config ignored: ${configPath} has JSONC parse errors: ${messages.join(', ')}.`;
}
