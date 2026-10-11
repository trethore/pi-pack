import { encodeJson } from "#src/sandbox/values";
import type { TextContent, ImageContent } from "@earendil-works/pi-ai";
import { formatSize } from "@earendil-works/pi-coding-agent";
import type { CodemodeOutputItem, CodemodeResult } from "#src/sandbox/types";
import type { CodemodeNestedCall } from "#src/types";
import { writeOutputFile } from "#src/output-files";
/** Default token budget for script output. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 10_000;
/** Characters per token when estimating. */
const CHARS_PER_TOKEN = 4;

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
      items.push({ type: "text", text: total > 1 ? `==> text ${index}/${total} <==\n${item.text}` : item.text });
    }
  }
  if (consoleLines.length > 0) {
    items.push({ type: "text", text: `<console_output>\n${consoleLines.join("\n")}\n</console_output>` });
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
    return "No tool calls were made.";
  }
  return `Tool calls made before the failure (they are not undone): ${calls.map((call) => `${call.name} (${call.status})`).join(", ")}`;
}

export function formatError(
  result: Extract<CodemodeResult, { ok: false }>,
  calls: readonly CodemodeNestedCall[],
): string {
  const { error } = result;
  const head =
    error.kind === "script"
      ? (error.stack ?? `${error.name ?? "Error"}: ${error.message}`)
      : error.kind === "timeout"
        ? `Script timed out: ${error.message}`
        : error.kind === "aborted"
          ? `Script aborted: ${error.message}`
          : `Script sandbox failed: ${error.message}`;
  return `${head}\n\n${formatCallSummary(calls)}`;
}

/** Write the full text output to a temp file, like bash does for truncated output. */
async function spillOutput(text: string): Promise<{ path: string } | { error: string }> {
  try {
    return { path: await writeOutputFile("pi-codemode", ".txt", text) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** File extensions of the image types `image()` accepts. Must list every type the sandbox's `image()` detects. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/**
 * Save each image to a temp file and put a text item with its path before it. The model sees the
 * image but has no other way to reach its bytes: scripts cannot write files, and `write` only takes
 * text. Images shown more than once are saved once.
 */
export async function saveImages(items: (TextContent | ImageContent)[]): Promise<(TextContent | ImageContent)[]> {
  const labels = new Map<string, Promise<string>>();

  const result = await Promise.all(
    items.map(async (item): Promise<(TextContent | ImageContent)[]> => {
      if (item.type !== "image") {
        return [item];
      }
      let pending = labels.get(item.data);
      if (!pending) {
        pending = label(item);
        labels.set(item.data, pending);
      }
      return [{ type: "text", text: await pending }, item];
    }),
  );
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
  let text = `Warning: truncated output (original token count: ${Math.ceil(combined.length / CHARS_PER_TOKEN)})\nTotal output lines: ${combined.split("\n").length}\n\n${head}...${Math.ceil(removed / CHARS_PER_TOKEN)} tokens truncated...${tail}`;
  const spilled = await spillOutput(combined);
  text +=
    "path" in spilled
      ? `\n\n[Full output: ${spilled.path} (read with offset/limit)]`
      : `\n\n[Could not save the full output: ${spilled.error}]`;
  return {
    items: [{ type: "text", text }, ...items.filter((item) => item.type === "image")],
    ...("path" in spilled ? { fullOutputPath: spilled.path } : {}),
  };
}

async function label({ data, mimeType }: ImageContent): Promise<string> {
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
    return `[Image saved to ${path} (${kind})]`;
  } catch (error) {
    return `[Image (${kind}) could not be saved: ${error instanceof Error ? error.message : String(error)}]`;
  }
}
