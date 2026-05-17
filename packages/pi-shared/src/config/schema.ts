import { isRecord } from '@trethore/pi-shared/object.js';
import { z } from 'zod';

export { z } from 'zod';

type ConfigParseResult<T> = { data: T; success: true } | { success: false };

export interface ConfigValueSchema<T> {
  readonly expected: string;
  safeParse(value: unknown): ConfigParseResult<T>;
}

export interface EnabledConfig {
  enabled: boolean;
}

export type PartialEnabledConfig = Partial<{
  enabled: unknown;
}>;

export type ConfigFieldMerger<T extends object> = (
  target: Partial<T>,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) => void;

export function defineConfigSchema<T>(
  schema: z.ZodType<T>,
  expected: string
): ConfigValueSchema<T> {
  return {
    expected,
    safeParse: (value) => schema.safeParse(value),
  };
}

export const booleanSchema = defineConfigSchema(z.boolean(), 'expected boolean');

export function createConfigMerger(extensionName: string) {
  const mergeField = makeMergeField(extensionName);

  return {
    mergeField,
    mergeEnabledField: makeMergeEnabledField(mergeField),
    mergeSection: makeMergeSection(extensionName),
  };
}

export function hasFields(value: object): boolean {
  return Object.keys(value).length > 0;
}

function makeMergeField(extensionName: string) {
  return function mergeField<T>(
    source: Record<string, unknown>,
    field: string,
    configName: string,
    schema: ConfigValueSchema<T>,
    configPath: string,
    errors: string[],
    apply: (value: T) => void
  ) {
    const value = source[field];
    if (value === undefined) return;

    const parsed = schema.safeParse(value);
    if (parsed.success) {
      apply(parsed.data);
      return;
    }

    errors.push(
      `${extensionName} config ignored invalid ${configName} value in ${configPath}; ${schema.expected}; keeping default.`
    );
  };
}

function makeMergeEnabledField(mergeField: ReturnType<typeof makeMergeField>) {
  return function mergeEnabledField(
    target: Partial<EnabledConfig>,
    source: Record<string, unknown>,
    configName: string,
    configPath: string,
    errors: string[]
  ) {
    mergeField(source, 'enabled', configName, booleanSchema, configPath, errors, (value) => {
      target.enabled = value;
    });
  };
}

function makeMergeSection(extensionName: string) {
  return function mergeSection(
    source: Record<string, unknown>,
    field: string,
    configPath: string,
    errors: string[],
    merge: (section: Record<string, unknown>, sectionName: string) => void
  ) {
    const value = source[field];
    if (value === undefined) return;

    if (!isRecord(value)) {
      errors.push(
        `${extensionName} config ignored invalid ${field} value in ${configPath}; expected object.`
      );
      return;
    }

    merge(value, field);
  };
}
