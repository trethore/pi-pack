import { prompts } from "#src/prompts/generated";
import { isRecord } from "#src/sandbox/values";
import { BridgeOutputType } from "#src/sandbox/bridge-protocol";

const DATA_URI_SCHEME = "data";
const DATA_URI_PREFIX = `${DATA_URI_SCHEME}:`;
const BASE64_ENCODING = "base64";
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64_GROUP_LENGTH = 4;
const IMAGE_SIGNATURE_PREFIX_LENGTH = 16;

// These patterns identify supported prefixes; they do not validate complete image files.
const IMAGE_SIGNATURES = [
  { mimeType: "image/png", pattern: /^iVBORw0KGg/ },
  { mimeType: "image/jpeg", pattern: /^[/]9j[/](?!9)/ },
  { mimeType: "image/gif", pattern: /^R0lGOD[dl]h/ },
  { mimeType: "image/webp", pattern: /^UklG.{8}RUJQ/ },
] as const;

function readDataUriPayload(uri: string): string {
  if (uri === "") {
    throw new TypeError(prompts.images.expected);
  }

  const colon = uri.indexOf(":");
  if (colon === -1) {
    throw new TypeError(prompts.images.invalidDataUri);
  }

  const scheme = uri.slice(0, colon).toLowerCase();
  if (scheme === "http" || scheme === "https") {
    throw new TypeError(prompts.images.remoteUrl);
  }

  if (scheme !== DATA_URI_SCHEME) {
    throw new TypeError(prompts.images.invalidDataUri);
  }

  const comma = uri.indexOf(",");
  if (comma === -1) {
    throw new TypeError(prompts.images.invalidDataUri);
  }

  const header = uri.slice(colon + 1, comma).split(";");
  const hasBase64Encoding = header.slice(1).some((part) => part.toLowerCase() === BASE64_ENCODING);
  if (!hasBase64Encoding) {
    throw new TypeError(prompts.images.invalidDataUri);
  }

  return uri.slice(comma + 1);
}

function readImageBlockData(value: Record<string, unknown>): string {
  if (typeof value.type !== "string") {
    throw new TypeError(prompts.images.expected);
  }

  if (value.type !== BridgeOutputType.Image) {
    throw new TypeError(`image only accepts MCP image blocks, got "${value.type}"`);
  }

  if (typeof value.data !== "string" || value.data === "") {
    throw new TypeError("image expected MCP image data");
  }

  if (value.data.toLowerCase().startsWith(DATA_URI_PREFIX)) {
    return readDataUriPayload(value.data);
  }

  return value.data;
}

function readImageData(value: unknown): string {
  if (typeof value === "string") {
    return readDataUriPayload(value);
  }

  if (!isRecord(value)) {
    throw new TypeError(prompts.images.expected);
  }

  if (value.image_url !== undefined) {
    if (typeof value.image_url !== "string") {
      throw new TypeError(prompts.images.expected);
    }

    return readDataUriPayload(value.image_url);
  }

  return readImageBlockData(value);
}

export function parseImage(value: unknown): { data: string; mimeType: string } {
  const encoded = readImageData(value);
  const data = encoded.replace(/\s+/g, "");
  if (data.length % BASE64_GROUP_LENGTH !== 0 || !BASE64_PATTERN.test(data)) {
    throw new TypeError("invalid image output. The image data is not valid base64 (truncated or corrupted?)");
  }

  const prefix = data.slice(0, IMAGE_SIGNATURE_PREFIX_LENGTH);
  const signature = IMAGE_SIGNATURES.find(({ pattern }) => pattern.test(prefix));
  if (!signature) {
    throw new TypeError("invalid image output. The image data is not a PNG, JPEG, GIF, or WebP image");
  }

  return { data, mimeType: signature.mimeType };
}
