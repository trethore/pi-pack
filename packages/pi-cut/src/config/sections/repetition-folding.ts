import { mergeField, mergeNestedConfig } from '#src/config/merge.js';
import type {
  BlockRepetitionFoldingConfig,
  LineRepetitionFoldingConfig,
  PartialRepetitionFoldingConfig,
  RepetitionFoldingConfig,
} from '#src/config/schema.js';
import { booleanSchema, minBlockLinesSchema, minRepeatsSchema } from '#src/config/validation.js';

export function mergeRepetitionFoldingFields(
  target: Partial<RepetitionFoldingConfig> | PartialRepetitionFoldingConfig,
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

function mergeLineRepetitionFoldingFields(
  target: Partial<LineRepetitionFoldingConfig>,
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
    'minRepeats',
    `${configName}.minRepeats`,
    minRepeatsSchema,
    configPath,
    errors,
    (value) => {
      target.minRepeats = value;
    }
  );
}

function mergeBlockRepetitionFoldingFields(
  target: Partial<BlockRepetitionFoldingConfig>,
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
    'minLines',
    `${configName}.minLines`,
    minBlockLinesSchema,
    configPath,
    errors,
    (value) => {
      target.minLines = value;
    }
  );
  mergeField(
    source,
    'minRepeats',
    `${configName}.minRepeats`,
    minRepeatsSchema,
    configPath,
    errors,
    (value) => {
      target.minRepeats = value;
    }
  );
}
