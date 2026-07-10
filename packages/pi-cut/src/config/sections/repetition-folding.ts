import { mergeEnabledField, mergeField } from '#src/config/merge.js';
import type { PartialRepetitionFoldingConfig, RepetitionFoldingConfig } from '#src/config/schema.js';
import { integerSchema, minRepeatsSchema, positiveIntegerSchema, savingsModeSchema } from '#src/config/validation.js';

export function mergeRepetitionFoldingFields(
  target: Partial<RepetitionFoldingConfig> | PartialRepetitionFoldingConfig,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeEnabledField(target, source, `${configName}.enabled`, configPath, errors);
  mergeField(source, 'minRepeats', `${configName}.minRepeats`, minRepeatsSchema, configPath, errors, (value) => {
    target.minRepeats = value;
  });
  mergeField(source, 'minSavedLines', `${configName}.minSavedLines`, integerSchema, configPath, errors, (value) => {
    target.minSavedLines = value;
  });
  mergeField(source, 'minSavedTokens', `${configName}.minSavedTokens`, integerSchema, configPath, errors, (value) => {
    target.minSavedTokens = value;
  });
  mergeField(
    source,
    'maxComparisons',
    `${configName}.maxComparisons`,
    positiveIntegerSchema,
    configPath,
    errors,
    (value) => {
      target.maxComparisons = value;
    }
  );
  mergeField(source, 'savingsMode', `${configName}.savingsMode`, savingsModeSchema, configPath, errors, (value) => {
    target.savingsMode = value;
  });
}
