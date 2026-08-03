export interface IntegerRange {
  minimum: number;
  maximum?: number;
}

export const LIMIT_RANGE = {
  minimum: 1,
  maximum: 1000,
} as const satisfies IntegerRange;

export const DEPTH_RANGE = {
  minimum: 1,
} as const satisfies IntegerRange;

export const MAX_CHARS_PER_MATCH_RANGE = {
  minimum: 100,
  maximum: 2000,
} as const satisfies IntegerRange;

export function parseIntegerInRange(value: string, range: IntegerRange): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < range.minimum) return undefined;
  if (range.maximum !== undefined && parsed > range.maximum) return undefined;
  return parsed;
}
