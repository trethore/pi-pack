import { describe, expect, it } from "vitest";
import { formatPrettyResult } from "#src/pretty-results";

it("formats objects with triple-quoted multiline strings", () => {
  // Arrange
  const source = JSON.stringify({
    name: "Alice",
    age: 25,
    active: true,
    message: "Hello!\nThis is a multiline message.\nGoodbye!",
  });

  // Act
  const formatted = formatPrettyResult(source);

  // Assert
  expect(formatted).toBe(
    'name: Alice\nage: 25\nactive: true\nmessage: """\nHello!\nThis is a multiline message.\nGoodbye!\n"""',
  );
});

it("indents nested objects, arrays, and multiline strings", () => {
  // Arrange
  const source = JSON.stringify({
    user: { name: "Alice", message: "Hello!\nGoodbye!" },
    tags: ["one", "two"],
    people: [{ age: 25 }],
    empty: {},
    items: [],
    missing: null,
  });

  // Act
  const formatted = formatPrettyResult(source);

  // Assert
  expect(formatted).toBe(
    [
      "user:",
      "  name: Alice",
      '  message: """',
      "  Hello!",
      "  Goodbye!",
      '  """',
      "tags:",
      "  - one",
      "  - two",
      "people:",
      "  -",
      "    age: 25",
      "empty: {}",
      "items: []",
      "missing: null",
    ].join("\n"),
  );
});

it("formats top-level arrays and preserves multiline whitespace", () => {
  // Arrange
  const source = JSON.stringify(["Alice", 25, true, null, "\nHello!\n"]);

  // Act / Assert
  expect(formatPrettyResult(source)).toBe('- Alice\n- 25\n- true\n- null\n- """\n\nHello!\n\n"""');
});

it.each([
  "",
  "true",
  "false",
  "null",
  "25",
  "yes",
  "on",
  " leading",
  "trailing ",
  "a: b",
  "#comment",
  'a\n"""\nb',
  "a\u0000b",
])("quotes ambiguous strings and delimiter collisions: %j", (value) => {
  // Arrange
  const source = JSON.stringify({ value });

  // Act / Assert
  expect(formatPrettyResult(source)).toBe(`value: ${JSON.stringify(value)}`);
});

it("quotes unusual keys without interpreting their contents", () => {
  // Arrange
  const source = '{"a: b":1,"line\\nbreak":2,"null":3,"__proto__":{"name":"Alice"}}';

  // Act / Assert
  expect(formatPrettyResult(source)).toBe('"a: b": 1\n"line\\nbreak": 2\n"null": 3\n__proto__:\n  name: Alice');
});

it("normalizes CRLF multiline strings for display", () => {
  // Arrange
  const source = JSON.stringify({ message: "Hello!\r\nGoodbye!" });

  // Act / Assert
  expect(formatPrettyResult(source)).toBe('message: """\nHello!\nGoodbye!\n"""');
});

describe("output boundaries", () => {
  it("formats joined JSON items without changing console output or script errors", () => {
    // Arrange
    const consoleOutput = '<console_output>\n{"log":true}\n</console_output>';
    const error = 'Script error:\nError: failed\n{"error":true}';
    const source = `==> text 1/2 <==\n{"name":"Alice"}\n==> text 2/2 <==\n{\n"age":25\n}\n${consoleOutput}\n${error}`;

    // Act / Assert
    expect(formatPrettyResult(source)).toBe(
      `==> text 1/2 <==\nname: Alice\n==> text 2/2 <==\nage: 25\n${consoleOutput}\n${error}`,
    );
  });

  it("does not format text markers inside console output or errors", () => {
    // Arrange
    const consoleOutput =
      '<console_output>\n==> text 1/2 <==\n{"log":true}\n==> text 2/2 <==\n{"log":false}\n</console_output>';
    const error = 'Script error:\n==> text 1/2 <==\n{"error":true}\n==> text 2/2 <==\n{"error":false}';
    const source = `{"name":"Alice"}\n${consoleOutput}\n${error}`;

    // Act / Assert
    expect(formatPrettyResult(source)).toBe(`name: Alice\n${consoleOutput}\n${error}`);
  });

  it.each([
    "[Image saved to /tmp/image.png (image/png, 1 KB)]",
    "[Image (image/png, 1 KB) could not be saved: failed]",
    "Note: models.generateImages() returned 1 image that the script did not show.",
  ])("preserves appended image notices: %s", (notice) => {
    // Arrange
    const source = `{"name":"Alice"}\n${notice}`;

    // Act / Assert
    expect(formatPrettyResult(source)).toBe(`name: Alice\n${notice}`);
  });
});

it.each([
  "plain text",
  '{"incomplete":',
  "null",
  "true",
  "25",
  '"Alice"',
  "{}",
  "[]",
  'Warning: truncated output\n{"name":...',
])("leaves non-collection or incomplete output unchanged: %s", (source) => {
  // Act / Assert
  expect(formatPrettyResult(source)).toBe(source);
});

it("bounds indentation for deeply nested output", () => {
  // Arrange
  let value: unknown = "end";
  for (let depth = 0; depth < 100; depth++) {
    value = { child: value };
  }

  // Act
  const formatted = formatPrettyResult(JSON.stringify(value));

  // Assert
  expect(formatted.split("\n")).toHaveLength(33);
  expect(formatted).toContain('child: {"child":');
  expect(formatted).toContain('"end"');
});
