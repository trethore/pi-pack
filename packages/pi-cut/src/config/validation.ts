import { z } from 'zod';
import { MIN_REPEATS } from '#src/config/schema.js';

export const booleanSchema = z.boolean();
export const nonEmptyStringSchema = z.string().refine((value) => value.trim().length > 0);
export const integerSchema = z.number().int();
export const positiveIntegerSchema = z.number().int().min(1);
export const minRepeatsSchema = z.number().int().min(MIN_REPEATS);
export const savingsModeSchema = z.enum(['or', 'and']);
export const toolSelectorSchema = z.string();

export function expected(schema: z.ZodType): string {
  if (schema === booleanSchema) return 'expected boolean';
  if (schema === nonEmptyStringSchema) return 'expected non-empty string';
  if (schema === integerSchema) return 'expected integer';
  if (schema === positiveIntegerSchema) return 'expected integer >= 1';
  if (schema === minRepeatsSchema) return `expected integer >= ${MIN_REPEATS}`;
  if (schema === savingsModeSchema) return 'expected "or" or "and"';
  return 'invalid value';
}
