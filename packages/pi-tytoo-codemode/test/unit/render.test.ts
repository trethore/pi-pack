import { stripVTControlCharacters } from "node:util";
import type { CodemodeNestedCall } from "#src/types";
import { beforeAll, describe, expect, it } from "vitest";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { createRenderers } from "#src/render";

const outputs = [
  { name: "read", value: { path: "file.ts", content: "hello" } },
  { name: "bash", value: { output: "hello", truncated: false, exit_code: 0, wall_time_seconds: 0.1 } },
];

function scriptResult(text: string) {
  return {
    content: [
      { type: "text" as const, text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
      { type: "text" as const, text },
    ],
    details: { calls: [] },
  };
}

describe.each(outputs)("rendering $name output", ({ value }) => {
  it.each([true, false])("preserves raw JSON without changing model content (expanded=%s)", (expanded) => {
    // Arrange
    const render = createRenderers(() => false).renderResult;
    if (!render) {
      throw new Error("Missing renderer");
    }
    const raw = JSON.stringify(value);
    const result = scriptResult(raw);
    const original = structuredClone(result);
    const theme = { fg: (_color: unknown, text: string) => text } as Parameters<typeof render>[2];
    const context = { showImages: false, isError: false } as Parameters<typeof render>[3];

    // Act
    const component = render(result, { expanded, isPartial: false }, theme, context);
    const rendered = component.render(120).join("\n");

    // Assert
    expect(rendered).toContain(raw);
    expect(rendered).not.toContain("Script completed");
    expect(result).toEqual(original);
  });
});

describe("pretty results", () => {
  beforeAll(() => {
    initTheme("dark", false);
  });

  it.each([true, false])("formats only the display before applying preview limits (expanded=%s)", (expanded) => {
    // Arrange
    const render = createRenderers().renderResult;
    if (!render) {
      throw new Error("Missing result renderer");
    }
    const raw = JSON.stringify({ name: "Alice", age: 25, active: true, message: "Hello!\nGoodbye!" });
    const result = scriptResult(raw);
    const original = structuredClone(result);
    const theme = { fg: (_color: unknown, text: string) => text } as Parameters<typeof render>[2];
    const context = { showImages: false, isError: false } as Parameters<typeof render>[3];

    // Act
    const rendered = stripVTControlCharacters(
      render(result, { expanded, isPartial: false }, theme, context).render(120).join("\n"),
    );

    // Assert
    expect(rendered).toContain("name: Alice");
    expect(rendered).toContain("age: 25");
    expect(rendered).toContain("active: true");
    expect(rendered).toContain('message: """');
    expect(rendered.includes("Goodbye!")).toBe(expanded);
    expect(rendered.includes("2 more lines")).toBe(!expanded);
    expect(rendered).not.toContain("Script completed");
    expect(result).toEqual(original);
  });
});

describe("renderer display limits", () => {
  beforeAll(() => {
    initTheme("dark", false);
  });

  it.each([true, false])("shows all code in both display states (expanded=%s)", (expanded) => {
    // Arrange
    const render = createRenderers().renderCall;
    if (!render) {
      throw new Error("Missing call renderer");
    }
    const lines = Array.from({ length: 12 }, (_, index) => `// line-${String(index).padStart(2, "0")}`);
    const theme = {
      fg: (_color: unknown, text: string) => text,
      bold: (text: string) => text,
    } as Parameters<typeof render>[1];
    const context = { expanded } as Parameters<typeof render>[2];

    // Act
    const component = render({ code: lines.join("\n") }, theme, context);
    const rendered = stripVTControlCharacters(component.render(120).join("\n"));

    // Assert
    expect(rendered.split("\n").map((line) => line.trimEnd())).toEqual(lines);
    expect(rendered).not.toContain("codemode");
    expect(rendered).not.toContain("more lines");
  });

  it.each([true, false])("limits output previews only when collapsed (expanded=%s)", (expanded) => {
    // Arrange
    const render = createRenderers().renderResult;
    if (!render) {
      throw new Error("Missing result renderer");
    }
    const lines = Array.from({ length: 7 }, (_, index) => `line-${index}`);
    const result = { content: [{ type: "text" as const, text: lines.join("\n") }], details: { calls: [] } };
    const theme = { fg: (_color: unknown, text: string) => text } as Parameters<typeof render>[2];
    const context = { showImages: false, isError: false } as Parameters<typeof render>[3];

    // Act
    const component = render(result, { expanded, isPartial: false }, theme, context);
    const rendered = component.render(120).join("\n");

    // Assert
    expect(rendered).toContain("line-4");
    expect(rendered.includes("line-5")).toBe(expanded);
    expect(rendered.includes("line-6")).toBe(expanded);
    expect(rendered.includes("2 more lines")).toBe(!expanded);
  });

  it.each([true, false])("limits recent calls only when collapsed (expanded=%s)", (expanded) => {
    // Arrange
    const render = createRenderers().renderResult;
    if (!render) {
      throw new Error("Missing result renderer");
    }
    const calls: CodemodeNestedCall[] = Array.from({ length: 9 }, (_, index) => ({
      id: String(index),
      name: `call-${index}`,
      args: "{}",
      status: "ok",
    }));
    const result = { content: [], details: { calls } };
    const theme = { fg: (_color: unknown, text: string) => text } as Parameters<typeof render>[2];
    const context = { showImages: false, isError: false } as Parameters<typeof render>[3];

    // Act
    const component = render(result, { expanded, isPartial: true }, theme, context);
    const rendered = component.render(200).join("\n");

    // Assert
    expect(rendered.includes("call-0")).toBe(expanded);
    expect(rendered.includes("1 earlier calls")).toBe(!expanded);
    expect(rendered).toContain("call-1");
    expect(rendered).toContain("call-8");
  });
});

describe.each([
  { expanded: false, limit: 60 },
  { expanded: true, limit: 120 },
])("call summaries (expanded=$expanded)", ({ expanded, limit }) => {
  function renderCall(args: string, overrides: Partial<CodemodeNestedCall> = {}) {
    const render = createRenderers().renderResult;
    if (!render) {
      throw new Error("Missing result renderer");
    }
    const call: CodemodeNestedCall = { id: "1", name: "bash", args, status: "ok", ...overrides };
    const result = { content: [], details: { calls: [call] } };
    const original = structuredClone(result);
    const theme = {
      fg: (_color: unknown, text: string) => {
        expect(text).not.toContain("\x1b");
        return `\x1b[32m${text}\x1b[39m`;
      },
    } as Parameters<typeof render>[2];
    const context = { showImages: false, isError: false } as Parameters<typeof render>[3];
    const rendered = render(result, { expanded, isPartial: false }, theme, context).render(200);
    expect(result).toEqual(original);
    expect(rendered.join("\n")).not.toContain("\x1b[0m");
    return rendered.map((line) => stripVTControlCharacters(line).trimEnd());
  }

  it.each([-1, 0, 1])("truncates only arguments exceeding the limit (offset=%s)", (offset) => {
    // Arrange
    const prefix = "[ok] bash ";
    const args = "x".repeat(limit + offset);
    const expectedArgs = "x".repeat(Math.min(limit + offset, limit));

    // Act
    const lines = renderCall(args, { durationMs: 1200, cost: 0.0123 });

    // Assert
    expect(lines).toEqual([prefix + expectedArgs + " 1.2s $0.0123"]);
  });

  it.each(["\n", "\r\n", "\r"])("stops at the first line break (%j)", (newline) => {
    // Arrange
    const args = `echo first${newline}echo second`;

    // Act
    const lines = renderCall(args, { durationMs: 1200, cost: 0.0123 });

    // Assert
    expect(lines).toEqual(["[ok] bash echo first 1.2s $0.0123"]);
  });

  it.each([-1, 0, 1])("handles newlines around the character limit (offset=%s)", (offset) => {
    // Arrange
    const prefix = "[ok] bash ";
    const args = `${"x".repeat(limit + offset)}\nsecond`;
    const expectedArgs = "x".repeat(Math.min(limit + offset, limit));

    // Act
    const lines = renderCall(args);

    // Assert
    expect(lines).toEqual([prefix + expectedArgs]);
  });

  it("preserves duration and cost when the summary fits", () => {
    // Arrange
    const metadata = { durationMs: 1200, cost: 0.0123 };

    // Act
    const lines = renderCall("echo hello", metadata);

    // Assert
    expect(lines).toEqual(["[ok] bash echo hello 1.2s $0.0123"]);
  });

  it.each(["error", "cancelled"] as const)("does not repeat error details below the %s summary", (status) => {
    // Arrange
    const expected = [`[${status}] bash ${"x".repeat(limit)} 1.2s`];

    // Act
    const lines = renderCall("x".repeat(200), {
      status,
      durationMs: 1200,
      error: "first error line\nsecond error line",
    });

    // Assert
    expect(lines).toEqual(expected);
  });
});
