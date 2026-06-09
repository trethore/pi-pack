export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isStructuredValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) return value.every((item) => isStructuredValue(item));
  if (isRecord(value)) return Object.values(value).every((item) => isStructuredValue(item));
  return false;
}

export type CloneStructuredValueOptions = {
  allowUndefined?: boolean | undefined;
};

export function cloneStructuredValue(value: unknown, options: CloneStructuredValueOptions = {}): unknown {
  if (value === undefined && options.allowUndefined) return value;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) return value.map((item) => cloneStructuredValue(item, options));
  if (isRecord(value)) return cloneStructuredRecord(value, options);
  throw new Error(`Unsupported structured value: ${typeof value}`);
}

function cloneStructuredRecord(
  value: Record<string, unknown>,
  options: CloneStructuredValueOptions = {}
): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) clone[key] = cloneStructuredValue(nested, options);
  return clone;
}

export function cloneRecordArray<TRecord extends Record<string, unknown>>(
  values: readonly unknown[]
): TRecord[] | undefined {
  if (!values.every(isRecord)) return undefined;
  return values.map((value) => structuredClone(value) as TRecord);
}
