import { normalizeToolPath } from '#src/utils/paths.js';

export function normalizeStringList(values: readonly string[] | undefined): string[] {
  return normalizeList(values, (value) => value.trim());
}

export function normalizeOptionalPathList(
  values: readonly string[] | undefined,
  fallback: readonly string[]
): string[] {
  const normalized = normalizeList(values, normalizeToolPath);
  return normalized.length > 0 ? normalized : [...fallback];
}

export function normalizeRequiredStringList(
  values: readonly string[] | undefined,
  options: { name: string; toolName: string }
): string[] {
  const normalized = normalizeStringList(values);
  if (normalized.length === 0) {
    throw new Error(`${options.toolName} failed: ${options.name} must contain at least one non-empty string`);
  }
  return normalized;
}

export function normalizeOptionalStringList(
  values: readonly string[] | undefined,
  fallback: readonly string[]
): string[] {
  const normalized = normalizeStringList(values);
  return normalized.length > 0 ? normalized : [...fallback];
}

export function formatStringList(values: readonly string[] | undefined, fallback: string): string {
  const normalized = normalizeStringList(values);
  return normalized.length > 0 ? normalized.join(',') : fallback;
}

export function formatOptionalStringListFlag(label: string, values: readonly string[] | undefined): string | undefined {
  const normalized = normalizeStringList(values);
  return normalized.length === 0 ? undefined : `${label} [${normalized.join(',')}]`;
}

function normalizeList(values: readonly string[] | undefined, normalize: (value: string) => string): string[] {
  if (values === undefined) return [];
  return [...new Set(values.map((value) => normalize(value)).filter(Boolean))];
}
