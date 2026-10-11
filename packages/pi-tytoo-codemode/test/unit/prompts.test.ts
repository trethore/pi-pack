import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { compilePrompts } from "#scripts/prompts";
import { prompts } from "#src/prompts/generated";

const directory = new URL("../../src/prompts/", import.meta.url);

async function evaluate(source: string): Promise<Record<string, unknown>> {
  const compiled = await compilePrompts(source);
  const script = stripTypeScriptTypes(compiled.replace("export const prompts", "const prompts"));
  return runInNewContext(`${script}\nprompts;`) as Record<string, unknown>;
}

describe("prompt catalog", () => {
  it("keeps the generated module synchronized with the YAML source", async () => {
    // Arrange
    const source = await readFile(new URL("prompts.yaml", directory), "utf8");
    const generated = await readFile(new URL("generated.ts", directory), "utf8");

    // Act
    const result = await compilePrompts(source);

    // Assert
    expect(result).toBe(generated);
  });

  it("preserves YAML whitespace, lists, and code without evaluating it", async () => {
    // Arrange
    const source = [
      "section:",
      "  body: |-",
      '    `code` ${notExecuted()} \\"quoted\\"',
      "      indented",
      "  trailing: |",
      "    line",
      "  guidelines:",
      '    - " leading and trailing "',
    ].join("\n");

    // Act
    const result = await evaluate(source);

    // Assert
    expect(result).toEqual({
      section: {
        body: '`code` ${notExecuted()} \\"quoted\\"\n  indented',
        trailing: "line\n",
        guidelines: [" leading and trailing "],
      },
    });
  });

  it("generates typed substitutions, including repeated and adjacent placeholders", async () => {
    // Arrange
    const source = 'message: "{{count}}{{name}} / {{name}}"';

    // Act
    const compiled = await compilePrompts(source);
    const result = await evaluate(source);
    const message = result.message as (values: { count: number; name: string }) => string;

    // Assert
    expect(compiled).toContain("count: string | number");
    expect(compiled).toContain("name: string | number");
    expect(message({ count: 2, name: "{{literal}} `$&`" })).toBe("2{{literal}} `$&` / {{literal}} `$&`");
  });

  it("treats JavaScript syntax in templated prompts as literal text", async () => {
    // Arrange
    const source = 'message: |-\n  {{name}} `code` ${notExecuted()} \\"quoted\\"';

    // Act
    const result = await evaluate(source);
    const message = result.message as (values: { name: string }) => string;

    // Assert
    expect(message({ name: "value" })).toBe('value `code` ${notExecuted()} \\"quoted\\"');
  });

  it("preserves the model docs substitution without interpreting its value", () => {
    // Arrange
    const docsPath = '/tmp/{{docsPath}}/"codemode".md';

    // Act
    const result = prompts.tool.models({ docsPath });

    // Assert
    expect(result).toBe(`- \`models\`: classifiers and image generation. Read ${docsPath} first.`);
  });

  it.each([
    { source: "", error: "prompts must be a section" },
    { source: "{}", error: "prompts must not be empty" },
    { source: "[]", error: "prompts must be a section" },
    { source: "message: 42", error: "prompts.message must be a section" },
    { source: "message: true", error: "prompts.message must be a section" },
    { source: "message: null", error: "prompts.message must be a section" },
    { source: 'message: " "', error: "prompts.message must not be empty" },
    { source: "section: {}", error: "prompts.section must not be empty" },
    { source: "guidelines: []", error: "prompts.guidelines must be a non-empty list of strings" },
    { source: "guidelines: [text, 42]", error: "prompts.guidelines must be a non-empty list of strings" },
    { source: "bad-key: text", error: "bad-key is not a valid prompt key" },
    { source: 'message: "{{name"', error: "invalid placeholder" },
    { source: 'message: "{{name.toString()}}"', error: "invalid placeholder" },
    { source: "message: first\nmessage: second", error: "unique" },
    { source: "message: &message text\nother: *message", error: "Alias" },
  ])("rejects invalid catalog content: $source", async ({ source, error }) => {
    // Act / Assert
    await expect(compilePrompts(source)).rejects.toThrow(error);
  });
});
