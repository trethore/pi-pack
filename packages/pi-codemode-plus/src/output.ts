import { formatJson } from "#src/format";

const OUTPUT_BOUNDARY = /(^==> text \d+\/\d+ <==\r?\n|^\[Image[^\r\n]*\](?:\r?\n|$))/m;
const OUTPUT_TAIL = /^<console_output>\r?\n|^Script error:\r?\n/m;

export function formatOutputText(text: string): string {
  if (text.startsWith("Warning: truncated output")) {
    return text;
  }
  // Pi joins text items and image labels, but console output and errors are not JSON values.
  const tailIndex = text.search(OUTPUT_TAIL);
  const output = tailIndex < 0 ? text : text.slice(0, tailIndex);
  const tail = tailIndex < 0 ? "" : text.slice(tailIndex);
  return output.split(OUTPUT_BOUNDARY).map(formatJson).join("") + tail;
}
