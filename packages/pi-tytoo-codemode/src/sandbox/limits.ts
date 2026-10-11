export const MAX_STORE_VALUE_CHARS = 256 * 1024;
export const MAX_STORE_TOTAL_CHARS = 1024 * 1024;
export const MAX_OUTPUT_CHARS = 16 * 1024 * 1024;
export const MAX_OUTPUT_ITEMS = 100_000;

export const DEFAULT_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;
export const MAX_MEMORY_LIMIT_BYTES = 1024 * 1024 * 1024;

export function isMemoryLimitBytes(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_MEMORY_LIMIT_BYTES;
}
