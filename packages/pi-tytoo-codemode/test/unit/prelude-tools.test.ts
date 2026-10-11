import { afterEach, describe, expect, it } from "vitest";
import { CodemodeSandbox } from "#src/sandbox/sandbox";
import type { CodemodeTool } from "#src/sandbox/types";

const TOOL_HINT = "ALL_TOOLS lists every tool; searchTools(query) finds tools by topic.";
const sandboxes: CodemodeSandbox[] = [];

function createSandbox(names: string[]): CodemodeSandbox {
  const tools: CodemodeTool[] = names.map((name) => ({ name, execute: () => undefined }));
  const sandbox = new CodemodeSandbox({ tools });
  sandboxes.push(sandbox);
  return sandbox;
}

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.close()));
});

describe("guarded tool names", () => {
  it("prefers normalized exact matches over substring matches", async () => {
    // Arrange
    const sandbox = createSandbox(["read_file", "ReadFile", "read_file_extra"]);

    // Act
    const result = await sandbox.execute("tools.READFILE;");

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: {
        name: "TypeError",
        message: `tools.READFILE does not exist. Did you mean tools.read_file, tools.ReadFile? ${TOOL_HINT} Check for a member with "READFILE" in tools.`,
      },
    });
  });

  it("limits substring suggestions to five names in registration order", async () => {
    // Arrange
    const sandbox = createSandbox(["lookup0", "lookup1", "lookup2", "lookup3", "lookup4", "lookup5"]);

    // Act
    const result = await sandbox.execute("tools.look;");

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: {
        message: `tools.look does not exist. Did you mean tools.lookup0, tools.lookup1, tools.lookup2, tools.lookup3, tools.lookup4? ${TOOL_HINT} Check for a member with "look" in tools.`,
      },
    });
  });

  it.each([20, 21])("keeps the available-name cutoff for %s tools", async (count) => {
    // Arrange
    const names = Array.from({ length: count }, (_, index) => `entry${index}`);
    const sandbox = createSandbox(names);
    const available = count === 20 ? ` Available: ${names.join(", ")}.` : "";

    // Act
    const result = await sandbox.execute("tools.missing;");

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: {
        message: `tools.missing does not exist.${available} ${TOOL_HINT} Check for a member with "missing" in tools.`,
      },
    });
  });

  it("preserves exact matches when normalization removes every character", async () => {
    // Arrange
    const sandbox = createSandbox(["___"]);

    // Act
    const result = await sandbox.execute('tools["!!!"];');

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: {
        message: `tools.!!! does not exist. Did you mean tools.___? ${TOOL_HINT} Check for a member with "!!!" in tools.`,
      },
    });
  });

  it("allows promise, JSON, symbol, and inherited-property probes", async () => {
    // Arrange
    const sandbox = createSandbox(["echo"]);

    // Act
    const result = await sandbox.execute(`
      return [
        (await tools) === tools,
        JSON.stringify(tools),
        typeof tools[Symbol.toStringTag],
        typeof tools.toString,
        Object.getPrototypeOf(tools) === null,
        Object.isFrozen(tools),
        Object.isFrozen(ALL_TOOLS),
        Object.isFrozen(ALL_TOOLS[0]),
      ];
    `);

    // Assert
    expect(result).toMatchObject({ ok: true, value: [true, "{}", "undefined", "undefined", true, true, true, true] });
  });
});
