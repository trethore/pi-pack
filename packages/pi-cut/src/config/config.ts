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
  const mergedConfig = {
    ...defaultConfig,
    terminalCleanup: { ...defaultConfig.terminalCleanup },
    duplicateLineFolding: { ...defaultConfig.duplicateLineFolding },
    lineTruncation: { ...defaultConfig.lineTruncation },
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

  mergeBooleanField(
    source.terminalCleanup,
    'enabled',
    'terminalCleanup.enabled',
    configPath,
    errors,
    (value) => {
      target.terminalCleanup.enabled = value;
    }
  );
  mergeBooleanField(
    source.terminalCleanup,
    'stripAnsi',
    'terminalCleanup.stripAnsi',
    configPath,
    errors,
    (value) => {
      target.terminalCleanup.stripAnsi = value;
    }
  );
  mergeBooleanField(
    source.terminalCleanup,
    'collapseCarriageReturns',
    'terminalCleanup.collapseCarriageReturns',
    configPath,
    errors,
    (value) => {
      target.terminalCleanup.collapseCarriageReturns = value;
    }
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

  mergeBooleanField(
    source.duplicateLineFolding,
    'enabled',
    'duplicateLineFolding.enabled',
    configPath,
    errors,
    (value) => {
      target.duplicateLineFolding.enabled = value;
    }
  );

  if (source.duplicateLineFolding.minRepeats !== undefined) {
    if (isIntegerAtLeast(source.duplicateLineFolding.minRepeats, 2)) {
      target.duplicateLineFolding.minRepeats = source.duplicateLineFolding.minRepeats;
    } else {
      errors.push(
        `pi-cut config ignored invalid duplicateLineFolding.minRepeats value in ${configPath}; expected integer >= 2.`
      );
    }
  }
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

  mergeBooleanField(
    source.lineTruncation,
    'enabled',
    'lineTruncation.enabled',
    configPath,
    errors,
    (value) => {
      target.lineTruncation.enabled = value;
    }
  );

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

function mergeBooleanField(
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
