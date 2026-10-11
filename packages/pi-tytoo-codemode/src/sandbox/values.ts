export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
export function argumentsArray(value: unknown): unknown[] {
  if (!isArray(value)) {
    throw new TypeError("Expected an argument array");
  }
  return value;
}
// The standard library signature omits undefined, which stringify returns for functions and symbols.
export function encodeJson(value: unknown): string | undefined {
  return JSON.stringify(value);
}
export function stringValue(value: unknown): string {
  return String(value);
}
export function parseJson(text: string): unknown {
  return JSON.parse(text);
}
