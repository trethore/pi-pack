import { mergeEnabledField, mergeField } from '#src/config/merge.js';
import type { TerminalCleanupConfig } from '#src/config/schema.js';
import { booleanSchema } from '#src/config/validation.js';

export function mergeTerminalCleanupFields(
  target: Partial<TerminalCleanupConfig>,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeEnabledField(target, source, `${configName}.enabled`, configPath, errors);
  mergeField(
    source,
    'stripAnsi',
    `${configName}.stripAnsi`,
    booleanSchema,
    configPath,
    errors,
    (value) => {
      target.stripAnsi = value;
    }
  );
  mergeField(
    source,
    'collapseCarriageReturns',
    `${configName}.collapseCarriageReturns`,
    booleanSchema,
    configPath,
    errors,
    (value) => {
      target.collapseCarriageReturns = value;
    }
  );
  mergeField(
    source,
    'trimTrailingWhitespace',
    `${configName}.trimTrailingWhitespace`,
    booleanSchema,
    configPath,
    errors,
    (value) => {
      target.trimTrailingWhitespace = value;
    }
  );
}
