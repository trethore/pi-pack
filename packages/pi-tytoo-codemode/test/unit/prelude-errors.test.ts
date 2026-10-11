import { afterEach, describe, expect, it } from "vitest";
import { describeError, formatValue } from "#src/sandbox/prelude/errors";
import { CodemodeSandbox } from "#src/sandbox/sandbox";

const sandboxes: CodemodeSandbox[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.close()));
});

function createUnformattableValue() {
  return {
    toJSON() {
      throw new Error("JSON conversion failed");
    },
    toString() {
      throw new Error("String conversion failed");
    },
  };
}

function createErrorWithThrowingProperty(property: string): Error {
  const error = new Error("boom");
  error.stack = "    at script (codemode.js:2)";
  Object.defineProperty(error, property, {
    get() {
      throw new Error("Error property failed");
    },
  });
  return error;
}

describe("value formatting", () => {
  it.each([
    { label: "strings", value: "hello", expected: "hello" },
    { label: "objects", value: { value: 42 }, expected: '{"value":42}' },
    { label: "null", value: null, expected: "null" },
    { label: "undefined", value: undefined, expected: "undefined" },
    { label: "numbers", value: 42, expected: "42" },
    { label: "booleans", value: true, expected: "true" },
    { label: "bigints", value: 42n, expected: "42" },
    { label: "symbols", value: Symbol("value"), expected: "Symbol(value)" },
  ])("formats $label", ({ value, expected }) => {
    // Act / Assert
    expect(formatValue(value)).toBe(expected);
  });

  it("uses string conversion when JSON conversion throws", () => {
    // Arrange
    const value = {
      toJSON() {
        throw new Error("JSON conversion failed");
      },
      toString() {
        return "readable value";
      },
    };

    // Act / Assert
    expect(formatValue(value)).toBe("readable value");
  });

  it("uses a fixed fallback when both conversions throw", () => {
    // Arrange
    const value = createUnformattableValue();

    // Act / Assert
    expect(formatValue(value)).toBe("[Unformattable value]");
  });

  it("uses the fallback when JSON returns undefined and string conversion throws", () => {
    // Arrange
    const value = {
      ...createUnformattableValue(),
      toJSON() {
        return undefined;
      },
    };

    // Act / Assert
    expect(formatValue(value)).toBe("[Unformattable value]");
  });

  it.each([
    { property: "name", expected: "[Unformattable value]" },
    { property: "message", expected: "[Unformattable value]" },
    { property: "stack", expected: "Error: boom" },
  ])("handles a throwing error $property getter", ({ property, expected }) => {
    // Arrange
    const error = createErrorWithThrowingProperty(property);

    // Act / Assert
    expect(formatValue(error)).toBe(expected);
  });

  it("handles a revoked proxy", () => {
    // Arrange
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    // Act / Assert
    expect(formatValue(proxy)).toBe("[Unformattable value]");
  });
});

describe("error descriptions", () => {
  it("preserves the error header and user frames while removing prelude frames", () => {
    // Arrange
    const error = new TypeError("boom");
    error.stack = "\n    at script (codemode.js:2)\n    at internal (codemode-prelude.js:10)\n  ";

    // Act
    const formatted = formatValue(error);
    const description: unknown = JSON.parse(describeError(error));

    // Assert
    expect(formatted).toBe("TypeError: boom\n    at script (codemode.js:2)");
    expect(description).toEqual({ name: "TypeError", message: "boom", stack: formatted });
  });

  it("describes unformattable non-Error values with the fixed fallback", () => {
    // Arrange
    const value = createUnformattableValue();

    // Act
    const description: unknown = JSON.parse(describeError(value));

    // Assert
    expect(description).toEqual({ message: "[Unformattable value]" });
  });

  it("keeps the existing fallback for errors with inaccessible properties", () => {
    // Arrange
    const error = createErrorWithThrowingProperty("name");

    // Act
    const description: unknown = JSON.parse(describeError(error));

    // Assert
    expect(description).toEqual({ message: "The script threw a value that cannot be described" });
  });
});

describe("QuickJS diagnostic formatting", () => {
  it.each([
    {
      label: "an unformattable object",
      setup: `const value = {
        toJSON() { throw new Error("JSON conversion failed"); },
        toString() { throw new Error("String conversion failed"); },
      };`,
      expected: "[Unformattable value]",
    },
    {
      label: "an error with a throwing name getter",
      setup: `const value = new Error("boom");
        Object.defineProperty(value, "name", { get() { throw new Error("name failed"); } });`,
      expected: "[Unformattable value]",
    },
    {
      label: "an error with a throwing stack getter",
      setup: `const value = new Error("boom");
        Object.defineProperty(value, "stack", { get() { throw new Error("stack failed"); } });`,
      expected: "Error: boom",
    },
  ])("logs $label without failing the script", async ({ setup, expected }) => {
    // Arrange
    const sandbox = new CodemodeSandbox();
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute(`${setup}\nconsole.log(value); return 42;`);

    // Assert
    expect(result).toMatchObject({
      ok: true,
      value: 42,
      output: [{ type: "text", text: expected, console: true }],
    });
  });
});
