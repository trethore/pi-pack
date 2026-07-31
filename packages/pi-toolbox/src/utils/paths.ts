export function normalizeToolPath(value: string): string {
  const normalized = value.trim();
  return normalized.startsWith('@') ? normalized.slice(1) : normalized;
}
