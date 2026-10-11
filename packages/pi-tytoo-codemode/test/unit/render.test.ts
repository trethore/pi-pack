import { describe, expect, it } from "vitest";
import { createRenderers } from "#src/render";

const outputs = [
  { name: "read", value: { path: "file.ts", content: "hello" } },
  { name: "bash", value: { output: "hello", truncated: false, exit_code: 0, wall_time_seconds: 0.1 } },
];

describe.each(outputs)("rendering $name output", ({ value }) => {
  it.each([true, false])("preserves raw JSON without changing model content (expanded=%s)", (expanded) => {
    // Arrange
    const render = createRenderers().renderResult;
    if (!render) {
      throw new Error("Missing renderer");
    }
    const raw = JSON.stringify(value);
    const result = {
      content: [
        { type: "text" as const, text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
        { type: "text" as const, text: raw },
      ],
      details: { calls: [] },
    };
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
