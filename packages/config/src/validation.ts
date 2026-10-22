export function booleanOption(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

export function unknownKeys(value: Record<string, unknown>, knownKeys: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !knownKeys.includes(key));
}
