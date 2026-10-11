import { stringValue } from "#src/sandbox/values";
import { encodeJson } from "#src/sandbox/values";
function errorText(error: Error): string {
  const name = stringValue(error.name);
  const head = error.message ? `${name}: ${stringValue(error.message)}` : name;
  const frames =
    typeof error.stack === "string"
      ? error.stack.split("\n").filter((line) => line.trim() && !line.includes("codemode-prelude.js"))
      : [];
  return [head, ...frames].join("\n");
}

export function format(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return errorText(value);
  }
  try {
    return encodeJson(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function describeError(error: unknown): string {
  try {
    if (error instanceof Error) {
      return JSON.stringify({
        name: stringValue(error.name),
        message: stringValue(error.message),
        stack: errorText(error),
      });
    }
    return JSON.stringify({ message: format(error) });
  } catch {
    return JSON.stringify({ message: "The script threw a value that cannot be described" });
  }
}
