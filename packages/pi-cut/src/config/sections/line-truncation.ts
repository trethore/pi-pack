import { mergeEnabledField, mergeField } from '#src/config/merge.js';
import type { LineTruncationConfig } from '#src/config/schema.js';
import { positiveIntegerSchema } from '#src/config/validation.js';

export function mergeLineTruncationFields(
  target: Partial<LineTruncationConfig>,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeEnabledField(target, source, `${configName}.enabled`, configPath, errors);
  mergeField(source, 'maxChars', `${configName}.maxChars`, positiveIntegerSchema, configPath, errors, (value) => {
    target.maxChars = value;
  });
}
