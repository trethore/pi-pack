import { prompts } from "#src/prompts/generated";
import { isRecord } from "#src/sandbox/values";

/**
 * Codemode source format: JavaScript, optionally preceded by one options line.
 *
 * ```js
 * // @options: {"max_output_tokens": 2000, "timeout_ms": 30000}
 * const text = await tools.read({ path: "package.json" });
 * text(JSON.parse(text).name);
 * ```
 */

const CODEMODE_OPTIONS_PREFIX = "// @options:";

const SUPPORTED_FIELDS: readonly string[] = ["max_output_tokens", "timeout_ms"];
const SUPPORTED_FIELDS_TEXT = SUPPORTED_FIELDS.map((field) => `\`${field}\``).join(" and ");

/** Largest delay `setTimeout` supports, which bounds `timeout_ms`. */
const MAX_TIMEOUT_MS = 2_147_483_647;

interface CodemodeSourceOptions {
  /** Token budget for the script's output. */
  maxOutputTokens?: number;
  /** Hard deadline for the whole script in milliseconds, including tool calls. */
  timeoutMs?: number;
}

export interface ParsedCodemodeSource {
  /** The script with the options line replaced by an empty line, so line numbers are unchanged. */
  code: string;
  options: CodemodeSourceOptions;
}

export class CodemodeSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodemodeSourceError";
  }
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseOptions(directive: string): CodemodeSourceOptions {
  if (directive === "") {
    throw new CodemodeSourceError(prompts.source.optionsObject({ fields: SUPPORTED_FIELDS_TEXT }));
  }

  let value: unknown;
  try {
    value = JSON.parse(directive);
  } catch (error) {
    throw new CodemodeSourceError(
      prompts.source.optionsJson({
        fields: SUPPORTED_FIELDS_TEXT,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  if (!isRecord(value)) {
    throw new CodemodeSourceError(prompts.source.optionsObject({ fields: SUPPORTED_FIELDS_TEXT }));
  }

  for (const key of Object.keys(value)) {
    if (!SUPPORTED_FIELDS.includes(key)) {
      throw new CodemodeSourceError(prompts.source.unsupportedOption({ fields: SUPPORTED_FIELDS_TEXT, key }));
    }
  }

  return readOptions(value);
}

function readOptions(fields: Record<string, unknown>): CodemodeSourceOptions {
  const options: CodemodeSourceOptions = {};
  const { max_output_tokens, timeout_ms } = fields;

  if (max_output_tokens !== undefined) {
    if (!isNonNegativeSafeInteger(max_output_tokens)) {
      throw new CodemodeSourceError(prompts.source.outputTokens);
    }

    options.maxOutputTokens = max_output_tokens;
  }

  if (timeout_ms !== undefined) {
    if (!isNonNegativeSafeInteger(timeout_ms) || timeout_ms === 0 || timeout_ms > MAX_TIMEOUT_MS) {
      throw new CodemodeSourceError(prompts.source.timeout({ limit: MAX_TIMEOUT_MS }));
    }

    options.timeoutMs = timeout_ms;
  }

  return options;
}

/**
 * Split an optional first-line `// @options: {...}` from the script. Throws
 * {@link CodemodeSourceError} for empty input and invalid options.
 */
export function parseCodemodeSource(input: string): ParsedCodemodeSource {
  if (input.trim() === "") {
    throw new CodemodeSourceError(prompts.source.empty);
  }

  const newline = input.indexOf("\n");
  const firstLine = (newline === -1 ? input : input.slice(0, newline)).replace(/\r$/, "");
  const trimmed = firstLine.trimStart();
  if (!trimmed.startsWith(CODEMODE_OPTIONS_PREFIX)) {
    return { code: input, options: {} };
  }

  const code = newline === -1 ? "" : input.slice(newline);
  if (code.trim() === "") {
    throw new CodemodeSourceError(prompts.source.missingCode);
  }

  const directive = trimmed.slice(CODEMODE_OPTIONS_PREFIX.length).trim();
  const options = parseOptions(directive);

  return { code, options };
}
