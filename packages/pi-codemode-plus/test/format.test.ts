import { expect, it } from "vitest";
import { formatJson } from "#src/format";

it("flattens nested fields and displays multiline strings", () => {
  // Arrange
  const source = JSON.stringify({
    user: { name: "Alice", age: 25, active: true },
    message: "Hello!\nThis is a multiline message.\nGoodbye!",
  });

  // Act
  const output = formatJson(source);

  // Assert
  expect(output).toBe(
    [
      "user.name: Alice",
      "user.age: 25",
      "user.active: true",
      "",
      'message: """',
      "Hello!",
      "This is a multiline message.",
      "Goodbye!",
      '"""',
    ].join("\n"),
  );
});

it.each([
  [{ items: [{ name: "Alice" }, { name: "Bob" }] }, "items[0].name: Alice\nitems[1].name: Bob"],
  [[1, null, false, {}, []], "[0]: 1\n[1]: null\n[2]: false\n[3]: {}\n[4]: []"],
  [{ "a.b": 1, a: { b: 2 }, "": 3, 'a"b': 4 }, '["a.b"]: 1\na.b: 2\n[""]: 3\n["a\\"b"]: 4'],
  [{ empty: {}, list: [], missing: null }, "empty: {}\nlist: []\nmissing: null"],
  [{ value: "true", count: "25", blank: "", spaced: " x " }, 'value: "true"\ncount: "25"\nblank: ""\nspaced: " x "'],
  [{ value: "literal\\ntext" }, 'value: "literal\\\\ntext"'],
  [{ value: "\nhello\n", next: "world" }, 'value: """\n\nhello\n\n"""\n\nnext: world'],
  [{ value: 'a\n"""\n\\n\r\t\u001b' }, 'value: """\na\n\\"\\"\\"\n\\\\n\\r\\t\\u001b\n"""'],
])("formats %j without ambiguous paths or scalars", (value, expected) => {
  // Act / Assert
  expect(formatJson(JSON.stringify(value))).toBe(expected);
});

it.each([
  "plain text",
  '"a JSON string"',
  "25",
  "true",
  "null",
  '{"truncated":',
  'prefix {"a":1}',
  '{"a":1}\nother text',
  '{"a":1}\n{"b":2}',
  '{"integer":9007199254740993}',
  '{"number":1e999}',
  "{}",
  "[]",
])("leaves unsupported or unsafe text unchanged: %s", (source) => {
  // Act / Assert
  expect(formatJson(source)).toBe(source);
});

it("preserves surrounding whitespace and negative zero", () => {
  // Act / Assert
  expect(formatJson(' \n{"value":-0}\n\n')).toBe(" \nvalue: -0\n\n");
});

it("handles prototype-related keys as ordinary fields", () => {
  // Act / Assert
  expect(formatJson('{"__proto__":{"polluted":true},"constructor":"value"}')).toBe(
    "__proto__.polluted: true\nconstructor: value",
  );
  expect(Object.hasOwn({}, "polluted")).toBe(false);
});

it("falls back for deeply nested values", () => {
  // Arrange
  const source = '{"a":'.repeat(100) + "0" + "}".repeat(100);

  // Act / Assert
  expect(formatJson(source)).toBe(source);
});

it("falls back for too many output fields", () => {
  // Arrange
  const source = JSON.stringify(Array.from({ length: 2_001 }, () => 0));

  // Act / Assert
  expect(formatJson(source)).toBe(source);
});

it("falls back before parsing oversized output", () => {
  // Arrange
  const source = JSON.stringify({ text: "a".repeat(100_000) });

  // Act / Assert
  expect(formatJson(source)).toBe(source);
});

it("bounds expansion from repeated parent paths", () => {
  // Arrange
  const source = JSON.stringify({ ["long".repeat(500)]: Array.from({ length: 200 }, () => 0) });

  // Act / Assert
  expect(formatJson(source)).toBe(source);
});
