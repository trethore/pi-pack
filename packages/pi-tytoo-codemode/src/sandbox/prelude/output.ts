import { isRecord, stringValue } from "#src/sandbox/values";
import { encodeJson } from "#src/sandbox/values";
import { MAX_OUTPUT_CHARS, MAX_OUTPUT_ITEMS } from "#src/sandbox/limits";
import type { HostBridge } from "#src/sandbox/prelude/bridge";
import { describeError, format } from "#src/sandbox/prelude/errors";
import type { createLifecycle } from "#src/sandbox/prelude/lifecycle";

const IMAGE_HELPER_EXPECTS =
  "image expects a non-empty image URL string, an object with image_url, or a raw MCP image block";
const IMAGE_SIGNATURES: [string, RegExp][] = [
  ["image/png", /^iVBORw0KGg/],
  ["image/jpeg", /^[/]9j[/](?!9)/],
  ["image/gif", /^R0lGOD[dl]h/],
  ["image/webp", /^UklG.{8}RUJQ/],
];
function imageUrl(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    throw new TypeError(IMAGE_HELPER_EXPECTS);
  }
  const item = value;
  if (item.image_url !== undefined) {
    if (typeof item.image_url !== "string") {
      throw new TypeError(IMAGE_HELPER_EXPECTS);
    }
    return item.image_url;
  }
  if (typeof item.type !== "string") {
    throw new TypeError(IMAGE_HELPER_EXPECTS);
  }
  if (item.type !== "image") {
    throw new TypeError(`image only accepts MCP image blocks, got "${item.type}"`);
  }
  if (typeof item.data !== "string" || item.data === "") {
    throw new TypeError("image expected MCP image data");
  }
  return item.data.toLowerCase().startsWith("data:") ? item.data : `data:;base64,${item.data}`;
}

function decodeImage(value: unknown): { data: string; mimeType: string } {
  const url = imageUrl(value);
  if (url === "") {
    throw new TypeError(IMAGE_HELPER_EXPECTS);
  }
  const colon = url.indexOf(":");
  const scheme = colon === -1 ? "" : url.slice(0, colon).toLowerCase();
  if (scheme === "http" || scheme === "https") {
    throw new TypeError("remote image URLs are not supported in tool outputs. Pass a base64 data URI instead");
  }
  const comma = url.indexOf(",");
  const header = comma === -1 ? [] : url.slice(colon + 1, comma).split(";");
  if (scheme !== "data" || comma === -1 || header.slice(1).every((part) => part.toLowerCase() !== "base64")) {
    throw new TypeError("invalid image output. Pass a base64 data URI instead");
  }
  return validateImageData(url.slice(comma + 1));
}

function validateImageData(encoded: string): { data: string; mimeType: string } {
  const data = encoded.replace(/\s+/g, "");
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new TypeError("invalid image output. The image data is not valid base64 (truncated or corrupted?)");
  }
  const signature = IMAGE_SIGNATURES.find(([, pattern]) => pattern.test(data.slice(0, 16)));
  if (!signature) {
    throw new TypeError("invalid image output. The image data is not a PNG, JPEG, GIF, or WebP image");
  }
  return { data, mimeType: signature[0] };
}

function outputText(value: unknown): string {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return String(value);
  }
  return encodeJson(value) ?? stringValue(value);
}

export function createOutput(bridge: HostBridge, lifecycle: ReturnType<typeof createLifecycle>) {
  let outputChars = 0;
  let outputItems = 0;
  function output(kind: "text" | "console" | "image", data: string, mimeType?: string): void {
    if (lifecycle.isFinished()) {
      return;
    }
    outputChars += data.length;
    outputItems++;
    if (outputChars > MAX_OUTPUT_CHARS || outputItems > MAX_OUTPUT_ITEMS) {
      const error = new RangeError(
        `script output exceeded the limit of ${MAX_OUTPUT_CHARS} characters or ${MAX_OUTPUT_ITEMS} text(), image(), and console calls. Print a summary instead, or write large data to a file with a tool.`,
      );
      lifecycle.done(false, describeError(error));
      throw error;
    }
    bridge("output", kind, data, mimeType);
  }
  const console = Object.fromEntries(
    ["log", "info", "warn", "error", "debug"].map((level) => [
      level,
      (...args: unknown[]) => {
        output("console", args.map(format).join(" "));
      },
    ]),
  );
  Object.freeze(console);
  return {
    console,
    text(this: void, value: unknown): void {
      let rendered: string;
      try {
        rendered = outputText(value);
      } catch (error) {
        throw new TypeError(error instanceof Error ? error.message : String(error), { cause: error });
      }
      output("text", rendered);
    },
    image(this: void, value: unknown): void {
      const { data, mimeType } = decodeImage(value);
      output("image", data, mimeType);
    },
  };
}
