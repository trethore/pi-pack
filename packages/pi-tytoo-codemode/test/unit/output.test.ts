import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import { CodemodeErrorKind, type CodemodeError } from "#src/sandbox/types";
import { formatError, joinAdjacentText, saveImages, truncateOutput } from "#src/output";
import * as outputFiles from "#src/output-files";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("output formatting", () => {
  it.each<{ error: CodemodeError; expected: string }>([
    {
      error: { kind: CodemodeErrorKind.Script, message: "failed", stack: "original stack" },
      expected: "original stack",
    },
    { error: { kind: CodemodeErrorKind.Script, name: "TypeError", message: "failed" }, expected: "TypeError: failed" },
    { error: { kind: CodemodeErrorKind.Script, message: "failed" }, expected: "Error: failed" },
    { error: { kind: CodemodeErrorKind.Timeout, message: "failed" }, expected: "Script timed out: failed" },
    { error: { kind: CodemodeErrorKind.Aborted, message: "failed" }, expected: "Script aborted: failed" },
    { error: { kind: CodemodeErrorKind.Sandbox, message: "failed" }, expected: "Script sandbox failed: failed" },
  ])("formats $expected without changing the call summary", ({ error, expected }) => {
    // Act
    const result = formatError({ ok: false, error, output: [], calls: [] }, []);

    // Assert
    expect(result).toBe(`${expected}\n\nNo tool calls were made.`);
  });

  it("saves repeated images once while preserving item order", async () => {
    // Arrange
    const writeOutputFile = vi.spyOn(outputFiles, "writeOutputFile").mockResolvedValue("/tmp/image.png");
    const image: ImageContent = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };
    const text: TextContent = { type: "text", text: "between images" };

    // Act
    const result = await saveImages([image, text, image]);

    // Assert
    expect(writeOutputFile).toHaveBeenCalledExactlyOnceWith("pi-codemode", ".png", Buffer.from("hello"));
    expect(result).toHaveLength(5);
    expect(result[0]).toHaveProperty("text", expect.stringContaining("[Image saved to /tmp/image.png"));
    expect(result[1]).toBe(image);
    expect(result[2]).toBe(text);
    expect(result[3]).toEqual(result[0]);
    expect(result[4]).toBe(image);
  });

  it.each([
    { budget: 0, body: "...about 3 tokens removed..." },
    { budget: 1, body: "ab...about 2 tokens removed...ij" },
  ])("preserves truncation formatting with a $budget-token budget", async ({ budget, body }) => {
    // Arrange
    const writeOutputFile = vi.spyOn(outputFiles, "writeOutputFile").mockResolvedValue("/tmp/output.txt");
    const image: ImageContent = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };
    const items: (TextContent | ImageContent)[] = [
      { type: "text", text: "abcde" },
      image,
      { type: "text", text: "fghij" },
    ];

    // Act
    const result = await truncateOutput(items, budget);

    // Assert
    expect(writeOutputFile).toHaveBeenCalledExactlyOnceWith("pi-codemode", ".txt", "abcde\nfghij");
    expect(result).toEqual({
      items: [
        {
          type: "text",
          text: `Warning: truncated output (estimated original tokens: 3)\nTotal output lines: 2\n\n${body}\n\n[Full output: /tmp/output.txt (read with offset/limit)]`,
        },
        image,
      ],
      fullOutputPath: "/tmp/output.txt",
    });
  });
});

describe("adjacent text joining", () => {
  it.each([
    { parts: [], expected: [] },
    { parts: [""], expected: [{ type: "text", text: "" }] },
    { parts: ["", "", "first", "", "second", ""], expected: [{ type: "text", text: "first\nsecond\n" }] },
    { parts: ["first\n", "", "second"], expected: [{ type: "text", text: "first\nsecond" }] },
  ])("preserves separators for $parts", ({ parts, expected }) => {
    // Arrange
    const items: TextContent[] = parts.map((text) => ({ type: "text", text }));

    // Act
    const joined = joinAdjacentText(items);

    // Assert
    expect(joined).toEqual(expected);
  });

  it("flushes text at image boundaries without mutating input", () => {
    // Arrange
    const image: ImageContent = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };
    const items: (TextContent | ImageContent)[] = [
      { type: "text", text: "first" },
      { type: "text", text: "second" },
      image,
      { type: "text", text: "third" },
    ];
    const original = structuredClone(items);

    // Act
    const joined = joinAdjacentText(items);

    // Assert
    expect(joined).toEqual([{ type: "text", text: "first\nsecond" }, image, { type: "text", text: "third" }]);
    expect(items).toEqual(original);
  });

  it("joins many output items into one block", () => {
    // Arrange
    const items: TextContent[] = Array.from({ length: 100_000 }, () => ({ type: "text", text: "value" }));

    // Act
    const joined = joinAdjacentText(items);

    // Assert
    expect(joined).toEqual([{ type: "text", text: Array(100_000).fill("value").join("\n") }]);
  });
});
