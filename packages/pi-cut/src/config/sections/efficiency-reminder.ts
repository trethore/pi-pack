import { mergeField } from '#src/config/merge.js';
import type { EfficiencyReminderConfig } from '#src/config/schema.js';
import {
  booleanSchema,
  nonEmptyStringSchema,
  positiveIntegerSchema,
} from '#src/config/validation.js';

export function mergeEfficiencyReminderFields(
  target: Partial<EfficiencyReminderConfig>,
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
    'onEvery',
    `${configName}.onEvery`,
    positiveIntegerSchema,
    configPath,
    errors,
    (value) => {
      target.onEvery = value;
    }
  );
  mergeField(
    source,
    'text',
    `${configName}.text`,
    nonEmptyStringSchema,
    configPath,
    errors,
    (value) => {
      target.text = value;
    }
  );
}
