import { errorMessage } from "@pi-pack/shared/errors";
import { prompts } from "#src/prompts/generated";
import { encodeJson } from "#src/sandbox/values";
import type { TextContent, ImageContent } from "@earendil-works/pi-ai";
import { formatSize } from "@earendil-works/pi-coding-agent";
import { CodemodeErrorKind, type CodemodeOutputItem, type CodemodeResult } from "#src/sandbox/types";
import type { CodemodeNestedCall } from "#src/types";
import { writeOutputFile } from "#src/output-files";

/** Default token budget for script output. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 10_000;
/** Characters per token when estimating. */
const CHARS_PER_TOKEN = 4;

/** File extensions of the image types `image()` accepts. Must list every type the sandbox's `image()` detects. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/** Like the script's `text()`: strings as is, other values as compact JSON. */
export function valueText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return encodeJson(value) ?? String(value);
}

/**
 * Lay out the script's output so the model can tell items apart: providers join adjacent text
 * blocks with a newline or with nothing. With more than one text item (`text()` or the returned
 * value), each starts with a `==> text N/M <==` line. `console.*` lines follow all other output in
 * one `<console_output>` block.
 */
export function formatOutput(output: readonly CodemodeOutputItem[]): (TextContent | ImageContent)[] {
  const total = output.filter((item) => item.type === "text" && !item.console).length;
  const items: (TextContent | ImageContent)[] = [];
  const consoleLines: string[] = [];

  let index = 0;
  for (const item of output) {
    if (item.type === "image") {
      items.push(item);
    } else if (item.console) {
      consoleLines.push(item.text);
    } else {
      index++;
      items.push({
        type: "text",
        text: total > 1 ? prompts.results.textItem({ index, total, text: item.text }) : item.text,
      });
    }
  }

  if (consoleLines.length > 0) {
    items.push({ type: "text", text: prompts.results.console({ lines: consoleLines.join("\n") }) });
  }

  return items;
}

/** Join adjacent text items into one, each part starting on its own line. */
export function joinAdjacentText(items: (TextContent | ImageContent)[]): (TextContent | ImageContent)[] {
  const joined: (TextContent | ImageContent)[] = [];

  for (const item of items) {
    const last = joined.at(-1);
    if (item.type === "text" && last?.type === "text") {
      const separator = last.text === "" || last.text.endsWith("\n") ? "" : "\n";
      joined[joined.length - 1] = { type: "text", text: `${last.text}${separator}${item.text}` };
    } else {
      joined.push(item);
    }
  }

  return joined;
}

function formatCallSummary(calls: readonly CodemodeNestedCall[]): string {
  if (calls.length === 0) {
    return prompts.results.noCalls;
  }

  return prompts.results.partialFailure({ calls: calls.map((call) => `${call.name} (${call.status})`).join(", ") });
}

export function formatError(
  result: Extract<CodemodeResult, { ok: false }>,
  calls: readonly CodemodeNestedCall[],
): string {
  const { error } = result;
  let head: string;

  switch (error.kind) {
    case CodemodeErrorKind.Script:
      head = error.stack ?? `${error.name ?? "Error"}: ${error.message}`;
      break;
    case CodemodeErrorKind.Timeout:
      head = prompts.results.timedOut({ message: error.message });
      break;
    case CodemodeErrorKind.Aborted:
      head = prompts.results.aborted({ message: error.message });
      break;
    case CodemodeErrorKind.Sandbox:
      head = prompts.results.sandboxFailed({ message: error.message });
      break;
  }

  return `${head}\n\n${formatCallSummary(calls)}`;
}

/** Write the full text output to a temp file, like bash does for truncated output. */
async function spillOutput(text: string): Promise<{ path: string } | { error: string }> {
  try {
    return { path: await writeOutputFile("pi-codemode", ".txt", text) };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/**
 * Save each image to a temp file and put a text item with its path before it. The model sees the
 * image but has no other way to reach its bytes: scripts cannot write files, and `write` only takes
 * text. Images shown more than once are saved once.
 */
export async function saveImages(items: (TextContent | ImageContent)[]): Promise<(TextContent | ImageContent)[]> {
  const labels = new Map<string, Promise<string>>();

  async function addImageDescription(item: TextContent | ImageContent): Promise<(TextContent | ImageContent)[]> {
    if (item.type !== "image") {
      return [item];
    }

    let pending = labels.get(item.data);
    if (!pending) {
      pending = saveImageAndDescribe(item);
      labels.set(item.data, pending);
    }

    return [{ type: "text", text: await pending }, item];
  }

  const result = await Promise.all(items.map(addImageDescription));
  return result.flat();
}

/**
 * Apply the token budget: when the combined text exceeds it, the text items become one
 * item that keeps the start and end of the text, and images follow it. The full text is written to
 * a temp file.
 */
export async function truncateOutput(
  items: (TextContent | ImageContent)[],
  maxTokens: number,
): Promise<{ items: (TextContent | ImageContent)[]; fullOutputPath?: string }> {
  const texts = items.filter((item): item is TextContent => item.type === "text").map((item) => item.text);
  const combined = texts.join("\n");
  const budget = maxTokens * CHARS_PER_TOKEN;
  if (texts.length === 0 || combined.length <= budget) {
    return { items };
  }

  const headChars = Math.floor(budget / 2);
  const tailChars = budget - headChars;
  const removed = combined.length - headChars - tailChars;
  const head = combined.slice(0, headChars);
  const tail = tailChars > 0 ? combined.slice(-tailChars) : "";

  let text = [
    prompts.results.truncatedWarning({ tokens: Math.ceil(combined.length / CHARS_PER_TOKEN) }),
    prompts.results.lineCount({ count: combined.split("\n").length }),
    "",
    prompts.results.truncatedBody({ head, tokens: Math.ceil(removed / CHARS_PER_TOKEN), tail }),
  ].join("\n");

  const spilled = await spillOutput(combined);
  text +=
    "path" in spilled
      ? prompts.results.fullOutput({ path: spilled.path })
      : prompts.results.fullOutputFailed({ error: spilled.error });

  return {
    items: [{ type: "text", text }, ...items.filter((item) => item.type === "image")],
    ...("path" in spilled ? { fullOutputPath: spilled.path } : {}),
  };
}

async function saveImageAndDescribe({ data, mimeType }: ImageContent): Promise<string> {
  const bytes = Buffer.from(data, "base64");
  const kind = `${mimeType}, ${formatSize(bytes.length)}`;
  const extension = IMAGE_EXTENSIONS[mimeType];
  if (!extension) {
    throw new Error(`No file extension for image type ${mimeType}`);
  }

  // A failed write (disk full, unwritable temp dir) must not discard the result of a script whose
  // tool calls already ran, so it becomes part of the label.
  try {
    const path = await writeOutputFile("pi-codemode", extension, bytes);
    return prompts.results.imageSaved({ path, kind });
  } catch (error) {
    return prompts.results.imageSaveFailed({ kind, error: errorMessage(error) });
  }
}
