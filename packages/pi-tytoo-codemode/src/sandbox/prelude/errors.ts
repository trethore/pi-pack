import { encodeJson, stringValue } from "#src/sandbox/values";
import { PRELUDE_FILENAME } from "#src/sandbox/constants";

const UNFORMATTABLE_VALUE = "[Unformattable value]";

function errorText(error: Error): string {
  const { name, message, stack } = error;
  const errorName = stringValue(name);
  const head = message ? `${errorName}: ${stringValue(message)}` : errorName;
  const frames =
    typeof stack === "string"
      ? stack.split("\n").filter((line) => line.trim() && !line.includes(PRELUDE_FILENAME))
      : [];

  return [head, ...frames].join("\n");
}

function safeStringValue(value: unknown): string {
  try {
    return stringValue(value);
  } catch {
    return UNFORMATTABLE_VALUE;
  }
}

export function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    if (value instanceof Error) {
      return errorText(value);
    }

    return encodeJson(value) ?? safeStringValue(value);
  } catch {
    return safeStringValue(value);
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

    return JSON.stringify({ message: formatValue(error) });
  } catch {
    return JSON.stringify({ message: "The script threw a value that cannot be described" });
  }
}
