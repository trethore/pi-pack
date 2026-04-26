import { existsSync, readFileSync } from 'node:fs';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { getConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  type LoadedConfig,
  type PartialPiCutConfig,
  type DuplicateLineFoldingConfig,
  type LineTruncationConfig,
  type PiCutConfig,
  type TerminalCleanupConfig,
  type ToolOverrideConfig,
} from '#src/config/schema.js';

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const mergedConfig = {
    ...defaultConfig,
    terminalCleanup: { ...defaultConfig.terminalCleanup },
    duplicateLineFolding: { ...defaultConfig.duplicateLineFolding },
    lineTruncation: { ...defaultConfig.lineTruncation },
    tools: [],
  };

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
  mergeTerminalCleanup(target, source, configPath, errors);
  mergeDuplicateLineFolding(target, source, configPath, errors);
  mergeLineTruncation(target, source, configPath, errors);
  mergeToolOverrides(target, source, configPath, errors);
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

function mergeTerminalCleanup(
  target: PiCutConfig,
  source: PartialPiCutConfig,
  configPath: string,
  errors: string[]
) {
  if (source.terminalCleanup === undefined) return;

  if (!isRecord(source.terminalCleanup)) {
    errors.push(
      `pi-cut config ignored invalid terminalCleanup value in ${configPath}; expected object.`
    );
    return;
  }

  mergeTerminalCleanupFields(
    target.terminalCleanup,
    source.terminalCleanup,
    'terminalCleanup',
    configPath,
    errors
  );
}

function mergeDuplicateLineFolding(
  target: PiCutConfig,
  source: PartialPiCutConfig,
  configPath: string,
  errors: string[]
) {
  if (source.duplicateLineFolding === undefined) return;

  if (!isRecord(source.duplicateLineFolding)) {
    errors.push(
      `pi-cut config ignored invalid duplicateLineFolding value in ${configPath}; expected object.`
    );
    return;
  }

  mergeDuplicateLineFoldingFields(
    target.duplicateLineFolding,
    source.duplicateLineFolding,
    'duplicateLineFolding',
    configPath,
    errors
  );
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

  mergeLineTruncationFields(
    target.lineTruncation,
    source.lineTruncation,
    'lineTruncation',
    configPath,
    errors
  );
}

function mergeToolOverrides(
  target: PiCutConfig,
  source: PartialPiCutConfig,
  configPath: string,
  errors: string[]
) {
  if (source.tools === undefined) return;

  if (!Array.isArray(source.tools)) {
    errors.push(`pi-cut config ignored invalid tools value in ${configPath}; expected array.`);
    return;
  }

  for (const [index, toolOverride] of source.tools.entries()) {
    const configName = `tools[${index}]`;
    if (!isRecord(toolOverride)) {
      errors.push(
        `pi-cut config ignored invalid ${configName} value in ${configPath}; expected object.`
      );
      continue;
    }

    const override = parseToolOverride(toolOverride, configName, configPath, errors);
    if (override) target.tools.push(override);
  }
}

function parseToolOverride(
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
): ToolOverrideConfig | undefined {
  const selector = parseToolSelector(source.selector, configName, configPath, errors);
  if (!selector) return undefined;

  const override: ToolOverrideConfig = { selector };
  mergeOptionalBooleanField(
    source,
    'enabled',
    `${configName}.enabled`,
    configPath,
    errors,
    (value) => {
      override.enabled = value;
    }
  );

  const terminalCleanup = parseStrategyOverride<TerminalCleanupConfig>(
    source,
    'terminalCleanup',
    configName,
    configPath,
    errors,
    mergeTerminalCleanupFields
  );
  if (terminalCleanup) override.terminalCleanup = terminalCleanup;

  const duplicateLineFolding = parseStrategyOverride<DuplicateLineFoldingConfig>(
    source,
    'duplicateLineFolding',
    configName,
    configPath,
    errors,
    mergeDuplicateLineFoldingFields
  );
  if (duplicateLineFolding) override.duplicateLineFolding = duplicateLineFolding;

  const lineTruncation = parseStrategyOverride<LineTruncationConfig>(
    source,
    'lineTruncation',
    configName,
    configPath,
    errors,
    mergeLineTruncationFields
  );
  if (lineTruncation) override.lineTruncation = lineTruncation;

  return hasToolOverrideFields(override) ? override : undefined;
}

function parseStrategyOverride<T extends object>(
  source: Record<string, unknown>,
  field: string,
  configName: string,
  configPath: string,
  errors: string[],
  mergeFields: (
    target: Partial<T>,
    source: Record<string, unknown>,
    configName: string,
    configPath: string,
    errors: string[]
  ) => void
): Partial<T> | undefined {
  const value = source[field];
  if (value === undefined) return undefined;

  const strategyConfigName = `${configName}.${field}`;
  if (!isRecord(value)) {
    errors.push(
      `pi-cut config ignored invalid ${strategyConfigName} value in ${configPath}; expected object.`
    );
    return undefined;
  }

  const target: Partial<T> = {};
  mergeFields(target, value, strategyConfigName, configPath, errors);
  return hasFields(target) ? target : undefined;
}

function hasToolOverrideFields(override: ToolOverrideConfig): boolean {
  return (
    override.enabled !== undefined ||
    override.terminalCleanup !== undefined ||
    override.duplicateLineFolding !== undefined ||
    override.lineTruncation !== undefined
  );
}

function hasFields(value: object): boolean {
  return Object.keys(value).length > 0;
}

function parseToolSelector(
  selector: unknown,
  configName: string,
  configPath: string,
  errors: string[]
): RegExp | undefined {
  if (typeof selector !== 'string') {
    errors.push(
      `pi-cut config ignored invalid ${configName}.selector value in ${configPath}; expected string.`
    );
    return undefined;
  }

  try {
    return new RegExp(selector === '*' ? '.*' : selector);
  } catch (error) {
    errors.push(
      `pi-cut config ignored invalid ${configName}.selector regex in ${configPath}: ${String(error)}.`
    );
    return undefined;
  }
}

function mergeTerminalCleanupFields(
  target: Partial<TerminalCleanupConfig>,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeOptionalBooleanField(
    source,
    'enabled',
    `${configName}.enabled`,
    configPath,
    errors,
    (value) => {
      target.enabled = value;
    }
  );
  mergeOptionalBooleanField(
    source,
    'stripAnsi',
    `${configName}.stripAnsi`,
    configPath,
    errors,
    (value) => {
      target.stripAnsi = value;
    }
  );
  mergeOptionalBooleanField(
    source,
    'collapseCarriageReturns',
    `${configName}.collapseCarriageReturns`,
    configPath,
    errors,
    (value) => {
      target.collapseCarriageReturns = value;
    }
  );
}

function mergeDuplicateLineFoldingFields(
  target: Partial<DuplicateLineFoldingConfig>,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeOptionalBooleanField(
    source,
    'enabled',
    `${configName}.enabled`,
    configPath,
    errors,
    (value) => {
      target.enabled = value;
    }
  );

  if (source.minRepeats !== undefined) {
    if (isIntegerAtLeast(source.minRepeats, 2)) {
      target.minRepeats = source.minRepeats;
    } else {
      errors.push(
        `pi-cut config ignored invalid ${configName}.minRepeats value in ${configPath}; expected integer >= 2.`
      );
    }
  }
}

function mergeLineTruncationFields(
  target: Partial<LineTruncationConfig>,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeOptionalBooleanField(
    source,
    'enabled',
    `${configName}.enabled`,
    configPath,
    errors,
    (value) => {
      target.enabled = value;
    }
  );

  if (source.maxChars !== undefined) {
    if (isPositiveInteger(source.maxChars)) {
      target.maxChars = source.maxChars;
    } else {
      errors.push(
        `pi-cut config ignored invalid ${configName}.maxChars value in ${configPath}; expected positive integer.`
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

function mergeOptionalBooleanField(
  source: Record<string, unknown>,
  field: string,
  configName: string,
  configPath: string,
  errors: string[],
  apply: (value: boolean) => void
) {
  const value = source[field];
  if (value === undefined) return;

  if (typeof value === 'boolean') {
    apply(value);
    return;
  }

  errors.push(
    `pi-cut config ignored invalid ${configName} value in ${configPath}; expected boolean.`
  );
}

function isPositiveInteger(value: unknown): value is number {
  return isIntegerAtLeast(value, 1);
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum;
}
