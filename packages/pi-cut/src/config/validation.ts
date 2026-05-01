import { z } from 'zod';
import { MIN_BLOCK_LINES, MIN_REPEATS } from '#src/config/schema.js';

export const booleanSchema = z.boolean();
export const nonEmptyStringSchema = z.string().refine((value) => value.trim().length > 0);
export const positiveIntegerSchema = z.number().int().min(1);
export const minRepeatsSchema = z.number().int().min(MIN_REPEATS);
export const minBlockLinesSchema = z.number().int().min(MIN_BLOCK_LINES);
export const toolSelectorSchema = z.string();

export function expected(schema: z.ZodType): string {
  if (schema === booleanSchema) return 'expected boolean';
  if (schema === nonEmptyStringSchema) return 'expected non-empty string';
  if (schema === positiveIntegerSchema) return 'expected integer >= 1';
  if (schema === minRepeatsSchema) return `expected integer >= ${MIN_REPEATS}`;
  if (schema === minBlockLinesSchema) return `expected integer >= ${MIN_BLOCK_LINES}`;
  return 'invalid value';
}
