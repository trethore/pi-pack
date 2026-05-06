import { defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';
import { MIN_REPEATS } from '#src/config/schema.js';

export { booleanSchema } from '@trethore/pi-shared/config/schema.js';
export const integerSchema = defineConfigSchema(z.number().int(), 'expected integer');
export const positiveIntegerSchema = defineConfigSchema(
  z.number().int().min(1),
  'expected integer >= 1'
);
export const minRepeatsSchema = defineConfigSchema(
  z.number().int().min(MIN_REPEATS),
  `expected integer >= ${MIN_REPEATS}`
);
export const savingsModeSchema = defineConfigSchema(
  z.enum(['or', 'and']),
  'expected "or" or "and"'
);
export const toolSelectorSchema = defineConfigSchema(z.string(), 'expected string');
