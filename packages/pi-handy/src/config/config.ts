import { existsSync, readFileSync } from 'node:fs';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { getConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  type LoadedConfig,
  type PartialPiHandyConfig,
  type PiHandyConfig,
} from '#src/config/schema.js';

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const config = cloneDefaultConfig();

  for (const configPath of getConfigPaths(cwd)) {
    const parsedConfig = readConfigFile(configPath, errors);
    if (parsedConfig) mergeConfig(config, parsedConfig, configPath, errors);
  }

  return { config, errors };
}

function cloneDefaultConfig(): PiHandyConfig {
  return {
    ...defaultConfig,
    thinkingLevel: { ...defaultConfig.thinkingLevel },
    switchWorkspace: { ...defaultConfig.switchWorkspace },
    showSysprompt: { ...defaultConfig.showSysprompt },
  };
}

function readConfigFile(configPath: string, errors: string[]): PartialPiHandyConfig | undefined {
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
    errors.push(`pi-handy config ignored: ${configPath} must contain a JSON object.`);
    return undefined;
  }

  return parsed;
}

function mergeConfig(
  target: PiHandyConfig,
  source: PartialPiHandyConfig,
  configPath: string,
  errors: string[]
) {
  if (source.enabled !== undefined) {
    const enabled = readBooleanField(source.enabled, 'enabled', configPath, errors);
    if (enabled !== undefined) target.enabled = enabled;
  }

  mergeFeatureConfig(
    target.thinkingLevel,
    source.thinkingLevel,
    'thinkingLevel',
    configPath,
    errors
  );
  mergeFeatureConfig(
    target.switchWorkspace,
    source.switchWorkspace,
    'switchWorkspace',
    configPath,
    errors
  );
  mergeFeatureConfig(
    target.showSysprompt,
    source.showSysprompt,
    'showSysprompt',
    configPath,
    errors
  );
}

function mergeFeatureConfig(
  target: { enabled: boolean },
  source: unknown,
  label: string,
  configPath: string,
  errors: string[]
) {
  if (source === undefined) return;

  if (!isRecord(source)) {
    errors.push(
      `pi-handy config ignored invalid ${label} value in ${configPath}; expected object.`
    );
    return;
  }

  if (source.enabled !== undefined) {
    const enabled = readBooleanField(source.enabled, `${label}.enabled`, configPath, errors);
    if (enabled !== undefined) target.enabled = enabled;
  }
}

function readBooleanField(
  value: unknown,
  label: string,
  configPath: string,
  errors: string[]
): boolean | undefined {
  if (typeof value === 'boolean') return value;

  errors.push(`pi-handy config ignored invalid ${label} value in ${configPath}; expected boolean.`);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatParseErrors(configPath: string, parseErrors: ParseError[]): string {
  const messages = parseErrors.map(
    (error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`
  );
  return `pi-handy config ignored: ${configPath} has JSONC parse errors: ${messages.join(', ')}.`;
}
