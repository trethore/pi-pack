import { isObject } from "@pi-pack/shared/validation";

interface BashOutput {
  output: string;
  truncated: boolean;
  exit_code: number;
  wall_time_seconds: number;
  full_output_path?: string;
}

const bashKeys = new Set(["output", "truncated", "exit_code", "wall_time_seconds", "full_output_path"]);

function hasValidStatus(value: Record<string, unknown>): boolean {
  return (
    typeof value.exit_code === "number" &&
    Number.isInteger(value.exit_code) &&
    typeof value.wall_time_seconds === "number" &&
    Number.isFinite(value.wall_time_seconds) &&
    value.wall_time_seconds >= 0
  );
}

function isBashOutput(value: unknown): value is BashOutput {
  if (!isObject(value)) {
    return false;
  }
  const validPath = !("full_output_path" in value) || typeof value.full_output_path === "string";
  return (
    validPath &&
    Object.keys(value).every((key) => bashKeys.has(key)) &&
    typeof value.output === "string" &&
    typeof value.truncated === "boolean" &&
    hasValidStatus(value)
  );
}

function formatSection(source: string): string {
  const json = source.trim();
  if (!json.startsWith("{") || !json.endsWith("}")) {
    return source;
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return source;
  }
  if (!isBashOutput(value)) {
    return source;
  }

  const separator = value.output === "" ? "" : value.output.endsWith("\n") ? "\n" : "\n\n";
  const metadata = `Exit: ${value.exit_code} | Time: ${value.wall_time_seconds}s | Truncated: ${value.truncated ? "yes" : "no"}`;
  const path = value.full_output_path === undefined ? "" : `\nFull output: ${value.full_output_path}`;
  const start = source.indexOf(json);
  return `${source.slice(0, start)}${value.output}${separator}${metadata}${path}${source.slice(start + json.length)}`;
}

export function formatBashOutput(source: string): string {
  // Console output and script errors are not text() results, even when they contain matching JSON.
  const boundary = source.search(/^(?:<console_output>|Script error:)\r?$/m);
  const output = boundary < 0 ? source : source.slice(0, boundary);
  const suffix = boundary < 0 ? "" : source.slice(boundary);
  const sections = output.split(/(^==> text [1-9]\d*\/[1-9]\d* <==\r?\n)/m);
  return sections.map(formatSection).join("") + suffix;
}
