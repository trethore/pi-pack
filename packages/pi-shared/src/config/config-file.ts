import { readFileSync } from 'node:fs';

import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { getErrorMessage, isMissingPathError } from '@trethore/pi-shared/error.js';
import { isRecord } from '@trethore/pi-shared/object.js';

export interface LoadedExtensionConfig<TConfig> {
  config: TConfig;
  errors: string[];
}

interface LoadJsoncExtensionConfigOptions<TConfig, TPartialConfig extends Record<string, unknown>> {
  cwd: string;
  extensionName: string;
  getConfigPaths(cwd: string): string[];
  createDefaultConfig(): TConfig;
  mergeConfig(target: TConfig, source: TPartialConfig, configPath: string, errors: string[]): void;
}

export function loadJsoncExtensionConfig<TConfig, TPartialConfig extends Record<string, unknown>>(
  options: LoadJsoncExtensionConfigOptions<TConfig, TPartialConfig>
): LoadedExtensionConfig<TConfig> {
  const errors: string[] = [];
  const config = options.createDefaultConfig();

  for (const configPath of options.getConfigPaths(options.cwd)) {
    const parsedConfig = readJsoncConfigFile<TPartialConfig>(configPath, options.extensionName, errors);
    if (parsedConfig) options.mergeConfig(config, parsedConfig, configPath, errors);
  }

  return { config, errors };
}

export function readJsoncConfigFile<T extends Record<string, unknown>>(
  configPath: string,
  extensionName: string,
  errors: string[]
): T | undefined {
  let contents: string;
  try {
    contents = readFileSync(configPath, 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    errors.push(`${extensionName} config ignored: could not read ${configPath}: ${getErrorMessage(error)}.`);
    return undefined;
  }

  const parseErrors: ParseError[] = [];
  const parsed = parse(contents, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as unknown;

  if (parseErrors.length > 0) {
    errors.push(formatParseErrors(extensionName, configPath, parseErrors));
    return undefined;
  }

  if (!isRecord(parsed)) {
    errors.push(`${extensionName} config ignored: ${configPath} must contain a JSON object.`);
    return undefined;
  }

  return parsed as T;
}

function formatParseErrors(extensionName: string, configPath: string, parseErrors: ParseError[]): string {
  const messages = parseErrors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`);
  return `${extensionName} config ignored: ${configPath} has JSONC parse errors: ${messages.join(', ')}.`;
}
