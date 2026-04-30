import { existsSync, readFileSync } from 'node:fs';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { getConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  MIN_BLOCK_LINES,
  MIN_REPEATS,
  type BlockRepetitionFoldingConfig,
  type EfficiencyReminderConfig,
  type LineRepetitionFoldingConfig,
  type LineTruncationConfig,
  type LoadedConfig,
  type PartialPiCutConfig,
  type PartialRepetitionFoldingConfig,
  type PiCutConfig,
  type RepetitionFoldingConfig,
  type TerminalCleanupConfig,
  type ToolOverrideConfig,
} from '#src/config/schema.js';

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const mergedConfig: PiCutConfig = {
    ...defaultConfig,
    terminalCleanup: { ...defaultConfig.terminalCleanup },
    repetitionFolding: {
      ...defaultConfig.repetitionFolding,
      line: { ...defaultConfig.repetitionFolding.line },
      block: { ...defaultConfig.repetitionFolding.block },
    },
    lineTruncation: { ...defaultConfig.lineTruncation },
    efficiencyReminder: { ...defaultConfig.efficiencyReminder },
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
  mergeRepetitionFolding(target, source, configPath, errors);
  mergeLineTruncation(target, source, configPath, errors);
  mergeEfficiencyReminder(target, source, configPath, errors);
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

function mergeRepetitionFolding(
  target: PiCutConfig,
  source: PartialPiCutConfig,
  configPath: string,
  errors: string[]
) {
  if (source.repetitionFolding === undefined) return;

  if (!isRecord(source.repetitionFolding)) {
    errors.push(
      `pi-cut config ignored invalid repetitionFolding value in ${configPath}; expected object.`
    );
    return;
  }

  mergeRepetitionFoldingFields(
    target.repetitionFolding,
    source.repetitionFolding,
    'repetitionFolding',
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

function mergeEfficiencyReminder(
  target: PiCutConfig,
  source: PartialPiCutConfig,
  configPath: string,
  errors: string[]
) {
  if (source.efficiencyReminder === undefined) return;

  if (!isRecord(source.efficiencyReminder)) {
    errors.push(
      `pi-cut config ignored invalid efficiencyReminder value in ${configPath}; expected object.`
    );
    return;
  }

  mergeEfficiencyReminderFields(
    target.efficiencyReminder,
    source.efficiencyReminder,
    'efficiencyReminder',
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

  const repetitionFolding = parseStrategyOverride<PartialRepetitionFoldingConfig>(
    source,
    'repetitionFolding',
    configName,
    configPath,
    errors,
    mergeRepetitionFoldingFields
  );
  if (repetitionFolding) override.repetitionFolding = repetitionFolding;

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
    override.repetitionFolding !== undefined ||
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
  mergeOptionalBooleanField(
    source,
    'trimTrailingWhitespace',
    `${configName}.trimTrailingWhitespace`,
    configPath,
    errors,
    (value) => {
      target.trimTrailingWhitespace = value;
    }
  );
}

function mergeRepetitionFoldingFields(
  target: Partial<RepetitionFoldingConfig> | PartialRepetitionFoldingConfig,
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

  mergeNestedConfig(
    target,
    source,
    'line',
    configName,
    configPath,
    errors,
    mergeLineRepetitionFoldingFields
  );
  mergeNestedConfig(
    target,
    source,
    'block',
    configName,
    configPath,
    errors,
    mergeBlockRepetitionFoldingFields
  );
}

function mergeNestedConfig<T extends object>(
  target: Record<string, unknown>,
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
) {
  const value = source[field];
  if (value === undefined) return;

  const nestedConfigName = `${configName}.${field}`;
  if (!isRecord(value)) {
    errors.push(
      `pi-cut config ignored invalid ${nestedConfigName} value in ${configPath}; expected object.`
    );
    return;
  }

  const nestedTarget = (target[field] ?? {}) as Partial<T>;
  mergeFields(nestedTarget, value, nestedConfigName, configPath, errors);
  if (hasFields(nestedTarget)) target[field] = nestedTarget;
}

function mergeLineRepetitionFoldingFields(
  target: Partial<LineRepetitionFoldingConfig>,
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
  mergeMinRepeatsField(target, source, configName, configPath, errors);
}

function mergeBlockRepetitionFoldingFields(
  target: Partial<BlockRepetitionFoldingConfig>,
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

  if (source.minLines !== undefined) {
    if (isIntegerAtLeast(source.minLines, MIN_BLOCK_LINES)) {
      target.minLines = source.minLines;
    } else {
      errors.push(
        `pi-cut config ignored invalid ${configName}.minLines value in ${configPath}; expected integer >= ${MIN_BLOCK_LINES}.`
      );
    }
  }

  mergeMinRepeatsField(target, source, configName, configPath, errors);
}

function mergeMinRepeatsField(
  target: { minRepeats?: number },
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  if (source.minRepeats === undefined) return;

  if (isIntegerAtLeast(source.minRepeats, MIN_REPEATS)) {
    target.minRepeats = source.minRepeats;
    return;
  }

  errors.push(
    `pi-cut config ignored invalid ${configName}.minRepeats value in ${configPath}; expected integer >= ${MIN_REPEATS}.`
  );
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
        `pi-cut config ignored invalid ${configName}.maxChars value in ${configPath}; expected integer >= 1.`
      );
    }
  }
}

function mergeEfficiencyReminderFields(
  target: Partial<EfficiencyReminderConfig>,
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

  if (source.onEvery !== undefined) {
    if (isPositiveInteger(source.onEvery)) {
      target.onEvery = source.onEvery;
    } else {
      errors.push(
        `pi-cut config ignored invalid ${configName}.onEvery value in ${configPath}; expected integer >= 1.`
      );
    }
  }

  if (source.text !== undefined) {
    if (typeof source.text === 'string' && source.text.trim().length > 0) {
      target.text = source.text;
    } else {
      errors.push(
        `pi-cut config ignored invalid ${configName}.text value in ${configPath}; expected non-empty string.`
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
