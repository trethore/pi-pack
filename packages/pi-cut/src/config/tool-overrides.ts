import { isRecord } from '@trethore/pi-shared/object.js';
import { hasFields, mergeField, type ConfigFieldMerger } from '#src/config/merge.js';
import type {
  LineTruncationConfig,
  NewLinesFoldingConfig,
  PartialPiCutConfig,
  PartialRepetitionFoldingConfig,
  PiCutConfig,
  TerminalCleanupConfig,
  ToolOverrideConfig,
} from '#src/config/schema.js';
import { mergeLineTruncationFields } from '#src/config/sections/line-truncation.js';
import { mergeNewLinesFoldingFields } from '#src/config/sections/new-lines-folding.js';
import { mergeRepetitionFoldingFields } from '#src/config/sections/repetition-folding.js';
import { mergeTerminalCleanupFields } from '#src/config/sections/terminal-cleanup.js';
import { booleanSchema, toolSelectorSchema } from '#src/config/validation.js';

export function mergeToolOverrides(
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
  mergeField(
    source,
    'enabled',
    `${configName}.enabled`,
    booleanSchema,
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

  const newLinesFolding = parseStrategyOverride<NewLinesFoldingConfig>(
    source,
    'newLinesFolding',
    configName,
    configPath,
    errors,
    mergeNewLinesFoldingFields
  );
  if (newLinesFolding) override.newLinesFolding = newLinesFolding;

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
  mergeFields: ConfigFieldMerger<T>
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

function parseToolSelector(
  selector: unknown,
  configName: string,
  configPath: string,
  errors: string[]
): RegExp | undefined {
  const parsedSelector = toolSelectorSchema.safeParse(selector);
  if (!parsedSelector.success) {
    errors.push(
      `pi-cut config ignored invalid ${configName}.selector value in ${configPath}; expected string.`
    );
    return undefined;
  }

  try {
    return new RegExp(parsedSelector.data === '*' ? '.*' : parsedSelector.data);
  } catch (error) {
    errors.push(
      `pi-cut config ignored invalid ${configName}.selector regex in ${configPath}: ${String(error)}.`
    );
    return undefined;
  }
}

function hasToolOverrideFields(override: ToolOverrideConfig): boolean {
  return (
    override.enabled !== undefined ||
    override.terminalCleanup !== undefined ||
    override.repetitionFolding !== undefined ||
    override.newLinesFolding !== undefined ||
    override.lineTruncation !== undefined
  );
}
