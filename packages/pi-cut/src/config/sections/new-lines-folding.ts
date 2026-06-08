import { mergeEnabledField, mergeField } from '#src/config/merge.js';
import type { NewLinesFoldingConfig } from '#src/config/schema.js';
import { atLeastTwoIntegerSchema } from '#src/config/validation.js';

export function mergeNewLinesFoldingFields(
  target: Partial<NewLinesFoldingConfig>,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) {
  mergeEnabledField(target, source, `${configName}.enabled`, configPath, errors);

  const nextConfig: Partial<NewLinesFoldingConfig> = { ...target };
  mergeField(
    source,
    'minNewLines',
    `${configName}.minNewLines`,
    atLeastTwoIntegerSchema,
    configPath,
    errors,
    (value) => {
      nextConfig.minNewLines = value;
    }
  );
  mergeField(source, 'foldTo', `${configName}.foldTo`, atLeastTwoIntegerSchema, configPath, errors, (value) => {
    nextConfig.foldTo = value;
  });

  if (
    nextConfig.minNewLines !== undefined &&
    nextConfig.foldTo !== undefined &&
    nextConfig.foldTo > nextConfig.minNewLines
  ) {
    errors.push(
      `pi-cut config ignored invalid ${configName} new lines folding values in ${configPath}; expected foldTo <= minNewLines.`
    );
    return;
  }

  target.minNewLines = nextConfig.minNewLines;
  target.foldTo = nextConfig.foldTo;
}
