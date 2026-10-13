import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import { beforeAll, expect, it, vi } from "vitest";
import { defaultConfig } from "#src/config";
import { wrapRenderers } from "#src/renderers";
import {
  longScript,
  renderCall,
  renderContext,
  renderResult,
  resultFor,
  upstreamRenderers,
} from "#test/render-harness";

let upstream: ToolRenderers;
beforeAll(async () => {
  upstream = await upstreamRenderers();
});

it("shows the full script without expanding results or changing shared context", () => {
  // Arrange
  const renderers = wrapRenderers(upstream, () => defaultConfig);
  const context = renderContext();
  const output = resultFor(JSON.stringify(Array.from({ length: 20 }, (_, index) => index)));

  // Act
  const script = renderCall(renderers, context);
  const result = renderResult(renderers, output, context);

  // Assert
  expect(script).toContain("const line25 = 25;");
  expect(script).not.toContain("more lines");
  expect(context.expanded).toBe(false);
  expect(result).toContain("more lines");
  expect(result).not.toContain("[19]: 19");
});

it.each([
  { ...defaultConfig, enabled: false },
  { ...defaultConfig, showFullScript: false },
])("preserves upstream call rendering for %j", (config) => {
  // Arrange
  const renderers = wrapRenderers(upstream, () => config);

  // Act / Assert
  expect(renderCall(renderers)).toBe(renderCall(upstream));
  expect(renderCall(renderers)).not.toContain("const line25");
});

it("preserves streaming source, options lines, wrapping, and component reuse", () => {
  // Arrange
  const original = { ...upstream, renderCall: vi.fn(upstream.renderCall) };
  const renderers = wrapRenderers(original, () => defaultConfig);
  const context = renderContext();
  context.argsComplete = false;
  const source = '// @options: {"timeout_ms": 60000}\n' + longScript + "\nawait tools.read({";

  // Act
  const output = renderCall(renderers, context, source, 40);

  // Assert
  expect(output).toContain("// @options:");
  expect(output).toContain("const line25");
  expect(output).toContain("await tools.read({");
  const forwarded = original.renderCall.mock.calls[0]?.[2];
  expect(forwarded).toEqual({ ...context, expanded: true });
  expect(forwarded?.state).toBe(context.state);
  expect(forwarded?.invalidate).toBe(context.invalidate);
});

it("formats a display-only copy while preserving result metadata and image blocks", () => {
  // Arrange
  const original = { ...upstream, renderResult: vi.fn(upstream.renderResult) };
  const renderers = wrapRenderers(original, () => defaultConfig);
  const result = resultFor('{"user":{"name":"Alice"},"message":"Hello!\\nGoodbye!"}');
  const image = { type: "image" as const, mimeType: "image/png", data: "" };
  result.content.push(image);
  const before = structuredClone(result);

  // Act
  const output = renderResult(renderers, result);

  // Assert
  expect(output).toContain("user.name: Alice");
  expect(output).toContain('message: """\nHello!\nGoodbye!\n"""');
  expect(result).toEqual(before);
  const forwarded = original.renderResult.mock.calls[0]?.[0];
  expect(forwarded?.details).toBe(result.details);
  expect(forwarded?.content[0]).toBe(result.content[0]);
  expect(forwarded?.content[2]).toBe(image);
});

it.each([
  { ...defaultConfig, enabled: false },
  { ...defaultConfig, prettyPrintOutput: false },
])("preserves upstream output for %j", (config) => {
  // Arrange
  const renderers = wrapRenderers(upstream, () => config);
  const result = resultFor('{"user":{"name":"Alice"}}');

  // Act / Assert
  expect(renderResult(renderers, result)).toBe(renderResult(upstream, result));
});

it("passes partial results through unchanged", () => {
  // Arrange
  const original = { ...upstream, renderResult: vi.fn(upstream.renderResult) };
  const renderers = wrapRenderers(original, () => defaultConfig);
  const result = resultFor('{"partial":true}');
  const context = { ...renderContext(), isPartial: true };

  // Act
  renderResult(renderers, result, context);

  // Assert
  expect(original.renderResult.mock.calls[0]?.[0]).toBe(result);
});

it("preserves nested calls, errors, timing, and truncation notices", () => {
  // Arrange
  const renderers = wrapRenderers(upstream, () => defaultConfig);
  const result = resultFor('Warning: truncated output\n==> text 1/1 <==\n{"ok":true}\n[Full output: /tmp/out.txt]');
  result.details = {
    calls: [
      { id: "call/1", name: "read", args: '{"path":"missing"}', status: "error", error: "not found", durationMs: 5 },
    ],
    fullOutputPath: "/tmp/out.txt",
  };
  const context = { ...renderContext(), isError: true, durationMs: 1500 };

  // Act / Assert
  expect(renderResult(renderers, result, context)).toBe(renderResult(upstream, result, context));
});

it("does not invent missing renderers or replace the shell", () => {
  // Act / Assert
  expect(wrapRenderers({ renderShell: "self" }, () => defaultConfig)).toEqual({ renderShell: "self" });
});
