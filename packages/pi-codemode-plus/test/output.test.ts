import { expect, it } from "vitest";
import { formatOutputText } from "#src/output";

it("formats numbered JSON items without touching plain-text items or their markers", () => {
  // Arrange
  const source =
    '==> text 1/3 <==\n{"user":{"name":"Alice"}}\n==> text 2/3 <==\nHello!\n==> text 3/3 <==\n[true,false]';

  // Act
  const output = formatOutputText(source);

  // Assert
  expect(output).toBe(
    "==> text 1/3 <==\nuser.name: Alice\n==> text 2/3 <==\nHello!\n==> text 3/3 <==\n[0]: true\n[1]: false",
  );
});

it.each([
  '<console_output>\n{"log":true}\n==> text 1/1 <==\n{"unchanged":true}\n</console_output>',
  'Script error:\n{"message":"failure"}\n==> text 1/1 <==\n{"unchanged":true}',
])("preserves console and error suffixes", (tail) => {
  // Arrange
  const source = '{"ok":true}\n' + tail;

  // Act / Assert
  expect(formatOutputText(source)).toBe("ok: true\n" + tail);
});

it("preserves image captions adjacent to JSON output", () => {
  // Arrange
  const caption = "[Image saved to /tmp/image.png (image/png, 100 B)]";

  // Act / Assert
  expect(formatOutputText('{"count":1}\n' + caption)).toBe("count: 1\n" + caption);
  expect(formatOutputText(caption + '\n{"count":1}')).toBe(caption + "\ncount: 1");
});

it("does not mistake escaped output markers inside JSON strings for boundaries", () => {
  // Arrange
  const source = JSON.stringify({ message: "first\n==> text 1/2 <==\nlast" });

  // Act / Assert
  expect(formatOutputText(source)).toBe('message: """\nfirst\n==> text 1/2 <==\nlast\n"""');
});

it("preserves truncated output including otherwise parseable sections", () => {
  // Arrange
  const source =
    'Warning: truncated output (original token count: 10000)\n==> text 1/2 <==\n{"ok":true}\n==> text 2/2 <==\n{"truncated":...\n[Full output: /tmp/output.txt]';

  // Act / Assert
  expect(formatOutputText(source)).toBe(source);
});

it("leaves the upstream script header unchanged", () => {
  // Arrange
  const header = "Script completed\nWall time 0.1 seconds\nOutput:\n";

  // Act / Assert
  expect(formatOutputText(header)).toBe(header);
});

it("supports CRLF item separators without normalizing plain text", () => {
  // Arrange
  const source = '==> text 1/2 <==\r\n{"count":1}\r\n==> text 2/2 <==\r\nplain\r\ntext';

  // Act / Assert
  expect(formatOutputText(source)).toBe("==> text 1/2 <==\r\ncount: 1\r\n==> text 2/2 <==\r\nplain\r\ntext");
});
