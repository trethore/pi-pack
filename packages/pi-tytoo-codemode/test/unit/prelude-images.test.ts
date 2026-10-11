import { describe, expect, it } from "vitest";
import { parseImage } from "#src/sandbox/prelude/images";

const PNG = "iVBORw0KGgo=";
const JPEG = "/9j/4A==";
const GIF = "R0lGODlh";
const WEBP = "UklGRgAAAABXRUJQ";

const EXPECTED_INPUT = "image expects a non-empty image URL string, an object with image_url, or a raw MCP image block";
const INVALID_URI = "invalid image output. Pass a base64 data URI instead";
const INVALID_BASE64 = "invalid image output. The image data is not valid base64 (truncated or corrupted?)";
const UNSUPPORTED_IMAGE = "invalid image output. The image data is not a PNG, JPEG, GIF, or WebP image";
const REMOTE_IMAGE = "remote image URLs are not supported in tool outputs. Pass a base64 data URI instead";

describe("image parsing", () => {
  it.each([
    { label: "PNG data URI", input: `data:image/png;base64,${PNG}`, data: PNG, mimeType: "image/png" },
    {
      label: "JPEG image_url",
      input: { image_url: `data:image/jpeg;base64,${JPEG}` },
      data: JPEG,
      mimeType: "image/jpeg",
    },
    { label: "raw GIF block", input: { type: "image", data: GIF }, data: GIF, mimeType: "image/gif" },
    { label: "raw WebP block", input: { type: "image", data: WEBP }, data: WEBP, mimeType: "image/webp" },
    { label: "incorrect MIME label", input: `data:image/png;base64,${WEBP}`, data: WEBP, mimeType: "image/webp" },
    {
      label: "incorrect block MIME",
      input: { type: "image", data: PNG, mimeType: "image/jpeg" },
      data: PNG,
      mimeType: "image/png",
    },
    { label: "case-insensitive data URI", input: `DaTa:image/png;BaSe64,${PNG}`, data: PNG, mimeType: "image/png" },
    {
      label: "additional metadata",
      input: `data:image/png;charset=utf-8;base64;extra,${PNG}`,
      data: PNG,
      mimeType: "image/png",
    },
    { label: "absent MIME label", input: `data:;base64,${PNG}`, data: PNG, mimeType: "image/png" },
    { label: "wrapped base64", input: "data:image/png;base64,iVBORw0K\r\nGgo=\n", data: PNG, mimeType: "image/png" },
    {
      label: "wrapped raw base64",
      input: { type: "image", data: "iVBORw0K\r\nGgo=\n" },
      data: PNG,
      mimeType: "image/png",
    },
    {
      label: "data URI inside a block",
      input: { type: "image", data: `DATA:image/png;BASE64,${PNG}` },
      data: PNG,
      mimeType: "image/png",
    },
    {
      label: "image_url precedence",
      input: { image_url: `data:image/png;base64,${PNG}`, type: "text", data: "invalid" },
      data: PNG,
      mimeType: "image/png",
    },
    {
      label: "undefined image_url",
      input: { image_url: undefined, type: "image", data: PNG },
      data: PNG,
      mimeType: "image/png",
    },
  ])("accepts $label", ({ input, data, mimeType }) => {
    // Act / Assert
    expect(parseImage(input)).toEqual({ data, mimeType });
  });

  it.each([
    { label: "null", input: null, message: EXPECTED_INPUT },
    { label: "number", input: 42, message: EXPECTED_INPUT },
    { label: "array", input: [], message: EXPECTED_INPUT },
    { label: "empty object", input: {}, message: EXPECTED_INPUT },
    { label: "empty string", input: "", message: EXPECTED_INPUT },
    { label: "empty image_url", input: { image_url: "" }, message: EXPECTED_INPUT },
    { label: "non-string image_url", input: { image_url: null }, message: EXPECTED_INPUT },
    { label: "missing block type", input: { data: PNG }, message: EXPECTED_INPUT },
    { label: "non-string block type", input: { type: 42, data: PNG }, message: EXPECTED_INPUT },
    {
      label: "wrong block type",
      input: { type: "text", data: PNG },
      message: 'image only accepts MCP image blocks, got "text"',
    },
    { label: "missing block data", input: { type: "image" }, message: "image expected MCP image data" },
    { label: "empty block data", input: { type: "image", data: "" }, message: "image expected MCP image data" },
    { label: "non-string block data", input: { type: "image", data: 42 }, message: "image expected MCP image data" },
    { label: "remote URL", input: "https://example.com/image.png", message: REMOTE_IMAGE },
    { label: "remote image_url", input: { image_url: "HTTP://example.com/image.png" }, message: REMOTE_IMAGE },
    {
      label: "remote URL in raw block data",
      input: { type: "image", data: "https://example.com/image.png" },
      message: INVALID_BASE64,
    },
    { label: "bare base64 string", input: PNG, message: INVALID_URI },
    { label: "missing colon", input: "https", message: INVALID_URI },
    { label: "leading URI whitespace", input: ` data:image/png;base64,${PNG}`, message: INVALID_URI },
    { label: "missing comma", input: "data:image/png;base64", message: INVALID_URI },
    { label: "missing encoding marker", input: `data:image/png,${PNG}`, message: INVALID_URI },
    { label: "encoding in the MIME slot", input: `data:base64,${PNG}`, message: INVALID_URI },
    { label: "incorrect encoding marker", input: `data:image/png;base64=true,${PNG}`, message: INVALID_URI },
    { label: "empty payload", input: "data:image/png;base64,", message: INVALID_BASE64 },
    { label: "whitespace-only block data", input: { type: "image", data: " \n" }, message: INVALID_BASE64 },
    { label: "invalid base64 character", input: "data:image/png;base64,AAAA!", message: INVALID_BASE64 },
    { label: "invalid base64 length", input: "data:image/png;base64,AAAAA", message: INVALID_BASE64 },
    { label: "invalid base64 padding", input: "data:image/png;base64,AA=A", message: INVALID_BASE64 },
    { label: "unknown image signature", input: "data:image/png;base64,AAAA", message: UNSUPPORTED_IMAGE },
    { label: "rejected JPEG prefix", input: "data:image/jpeg;base64,/9j/9w==", message: UNSUPPORTED_IMAGE },
  ])("rejects $label with the existing error", ({ input, message }) => {
    // Act / Assert
    expect(() => parseImage(input)).toThrow(new TypeError(message));
  });
});
