import { mergeField } from '#src/config/merge.js';
import type { LineTruncationConfig } from '#src/config/schema.js';
import { booleanSchema, positiveIntegerSchema } from '#src/config/validation.js';

export function mergeLineTruncationFields(
  target: Partial<LineTruncationConfig>,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeField(
    source,
    'enabled',
    `${configName}.enabled`,
    booleanSchema,
    configPath,
    errors,
    (value) => {
      target.enabled = value;
    }
  );
  mergeField(
    source,
    'maxChars',
    `${configName}.maxChars`,
    positiveIntegerSchema,
    configPath,
    errors,
    (value) => {
      target.maxChars = value;
    }
  );
}
