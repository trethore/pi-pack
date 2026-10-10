import { describe, expect, it } from "vitest";
import { formatBashOutput } from "#src/format";

const bash = { output: "hello\nworld\n", truncated: false, exit_code: 0, wall_time_seconds: 0.1 };
const formatted = "hello\nworld\n\nExit: 0 | Time: 0.1s | Truncated: no";

describe("Bash-shaped output", () => {
  it("renders output followed by metadata", () => {
    // Act
    const result = formatBashOutput(JSON.stringify(bash));

    // Assert
    expect(result).toBe(formatted);
  });

  it("ignores property order and accepts indented JSON", () => {
    // Arrange
    const source = JSON.stringify(
      {
        wall_time_seconds: 1,
        exit_code: 2,
        truncated: true,
        full_output_path: "/tmp/full-output.txt",
        output: "failed",
      },
      null,
      2,
    );

    // Act
    const result = formatBashOutput(source);

    // Assert
    expect(result).toBe("failed\n\nExit: 2 | Time: 1s | Truncated: yes\nFull output: /tmp/full-output.txt");
  });

  it.each([
    ["", "Exit: 0 | Time: 0s | Truncated: no"],
    ["hello", "hello\n\nExit: 0 | Time: 0s | Truncated: no"],
    ["hello\n\n", "hello\n\n\nExit: 0 | Time: 0s | Truncated: no"],
    ["  hello\tworld\r\n", "  hello\tworld\r\n\nExit: 0 | Time: 0s | Truncated: no"],
  ])("preserves command output %j", (output, expected) => {
    // Arrange
    const source = JSON.stringify({ ...bash, output, wall_time_seconds: 0 });

    // Act / Assert
    expect(formatBashOutput(source)).toBe(expected);
  });

  it("preserves whitespace around the serialized result", () => {
    // Arrange
    const source = ` \n${JSON.stringify(bash)}\n\n`;

    // Act / Assert
    expect(formatBashOutput(source)).toBe(` \n${formatted}\n\n`);
  });

  it("shows a supplied full output path even when truncated is false", () => {
    // Arrange
    const source = JSON.stringify({ ...bash, full_output_path: "/tmp/output" });

    // Act / Assert
    expect(formatBashOutput(source)).toBe(`${formatted}\nFull output: /tmp/output`);
  });
});

describe("conservative recognition", () => {
  it.each([
    { output: undefined },
    { output: 42 },
    { truncated: undefined },
    { truncated: "false" },
    { exit_code: undefined },
    { exit_code: "0" },
    { exit_code: 0.5 },
    { exit_code: null },
    { wall_time_seconds: undefined },
    { wall_time_seconds: "0.1" },
    { wall_time_seconds: -1 },
    { wall_time_seconds: null },
    { full_output_path: null },
    { full_output_path: 42 },
    { unexpected: true },
  ])("leaves mismatched objects unchanged: %j", (overrides) => {
    // Arrange
    const source = JSON.stringify({ ...bash, ...overrides });

    // Act / Assert
    expect(formatBashOutput(source)).toBe(source);
  });

  it.each([
    "",
    "hello world",
    "null",
    "[]",
    '{"output":"hello"}',
    JSON.stringify([bash]),
    JSON.stringify({ result: bash }),
    JSON.stringify(JSON.stringify(bash)),
    `prefix ${JSON.stringify(bash)}`,
    `${JSON.stringify(bash)} suffix`,
    `${JSON.stringify(bash)}\n${JSON.stringify(bash)}`,
    JSON.stringify(bash).slice(0, -1),
    JSON.stringify(bash).replace('"wall_time_seconds":0.1', '"wall_time_seconds":1e400'),
    JSON.stringify(bash).replace('"exit_code":0', '"exit_code":1e400'),
  ])("preserves other text or incomplete JSON: %s", (source) => {
    // Act / Assert
    expect(formatBashOutput(source)).toBe(source);
  });
});

describe("codemode output sections", () => {
  it("preserves separators and unrelated tool output", () => {
    // Arrange
    const source = `==> text 1/3 <==\nfile contents\n==> text 2/3 <==\n${JSON.stringify(bash)}\n==> text 3/3 <==\n{"written":true}`;

    // Act
    const result = formatBashOutput(source);

    // Assert
    expect(result).toBe(
      `==> text 1/3 <==\nfile contents\n==> text 2/3 <==\n${formatted}\n==> text 3/3 <==\n{"written":true}`,
    );
  });

  it("formats multiple matching sections independently", () => {
    // Arrange
    const source = `==> text 1/2 <==\n${JSON.stringify(bash)}\n==> text 2/2 <==\n${JSON.stringify(bash)}`;

    // Act / Assert
    expect(formatBashOutput(source)).toBe(`==> text 1/2 <==\n${formatted}\n==> text 2/2 <==\n${formatted}`);
  });

  it.each([`<console_output>\n${JSON.stringify(bash)}\n</console_output>`, "Script error:\nError: command failed"])(
    "preserves the trailing console or error section",
    (suffix) => {
      // Arrange
      const source = `==> text 1/2 <==\nfirst\n==> text 2/2 <==\n${JSON.stringify(bash)}\n${suffix}`;

      // Act / Assert
      expect(formatBashOutput(source)).toBe(`==> text 1/2 <==\nfirst\n==> text 2/2 <==\n${formatted}\n${suffix}`);
      expect(formatBashOutput(suffix)).toBe(suffix);
    },
  );

  it("does not reinterpret separators or console markers inside command output", () => {
    // Arrange
    const output = "==> text 1/2 <==\n<console_output>\nhello\n</console_output>\nScript error:";
    const source = JSON.stringify({ ...bash, output });

    // Act / Assert
    expect(formatBashOutput(source)).toBe(`${output}\n\nExit: 0 | Time: 0.1s | Truncated: no`);
  });

  it("keeps a truncated JSON section and its notice unchanged", () => {
    // Arrange
    const source = `==> text 1/2 <==\n${JSON.stringify(bash)}\n==> text 2/2 <==\n{"output":"cut\n[Full output: /tmp/codemode-output.txt]`;

    // Act / Assert
    expect(formatBashOutput(source)).toBe(
      `==> text 1/2 <==\n${formatted}\n==> text 2/2 <==\n{"output":"cut\n[Full output: /tmp/codemode-output.txt]`,
    );
  });

  it("preserves CRLF separators", () => {
    // Arrange
    const source = `==> text 1/2 <==\r\nfirst\r\n==> text 2/2 <==\r\n${JSON.stringify(bash)}\r\n`;

    // Act / Assert
    expect(formatBashOutput(source)).toBe(`==> text 1/2 <==\r\nfirst\r\n==> text 2/2 <==\r\n${formatted}\r\n`);
  });
});
