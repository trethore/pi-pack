import type { z } from 'zod';
import { expected } from '#src/config/validation.js';

export type ConfigFieldMerger<T extends object> = (
  target: Partial<T>,
  source: Record<string, unknown>,
  configName: string,
  configPath: string,
  errors: string[]
) => void;

export function mergeField<T>(
  source: Record<string, unknown>,
  field: string,
  configName: string,
  schema: z.ZodType<T>,
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
    `pi-cut config ignored invalid ${configName} value in ${configPath}; ${expected(schema)}.`
  );
}

export function mergeSection(
  source: Record<string, unknown>,
  field: string,
  configPath: string,
  errors: string[],
  merge: (section: Record<string, unknown>, sectionName: string) => void
) {
  const value = source[field];
  if (value === undefined) return;

  if (!isRecord(value)) {
    errors.push(`pi-cut config ignored invalid ${field} value in ${configPath}; expected object.`);
    return;
  }

  merge(value, field);
}

export function mergeNestedConfig<T extends object>(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  field: string,
  configName: string,
  configPath: string,
  errors: string[],
  mergeFields: ConfigFieldMerger<T>
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

export function hasFields(value: object): boolean {
  return Object.keys(value).length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
