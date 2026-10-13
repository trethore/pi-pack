import { highlightCode, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import { beforeAll, expect, it, vi } from "vitest";
import { defaultConfig } from "#src/config";
import { wrapRenderers } from "#src/renderers";
import {
  longScript,
  plain,
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
  expect(script).toBe(longScript);
  expect(script).not.toContain("more lines");
  expect(context.expanded).toBe(false);
  expect(result).toContain("more lines");
  expect(result).not.toContain("[19]: 19");
});

it.each([
  { ...defaultConfig, enabled: false },
  { ...defaultConfig, hideHeader: false, showFullScript: false },
])("preserves upstream call rendering for %j", (config) => {
  // Arrange
  const renderers = wrapRenderers(upstream, () => config);

  // Act / Assert
  expect(renderCall(renderers)).toBe(renderCall(upstream));
  expect(renderCall(renderers)).not.toContain("const line25");
});

it.each([false, true])("hides the header while preserving the script preview with expanded=%s", (expanded) => {
  // Arrange
  const renderers = wrapRenderers(upstream, () => ({ ...defaultConfig, showFullScript: false }));
  const expected = renderCall(upstream, renderContext(expanded)).replace(/^codemode\n/, "");

  // Act
  const output = renderCall(renderers, renderContext(expanded));

  // Assert
  expect(output).toBe(expected);
});

it("can keep the header without disabling other features", () => {
  // Arrange
  const renderers = wrapRenderers(upstream, () => ({ ...defaultConfig, hideHeader: false }));

  // Act / Assert
  expect(renderCall(renderers)).toBe("codemode\n" + longScript);
  expect(renderResult(renderers, resultFor('{"name":"Alice"}'))).toBe("name: Alice");
});

it.each([1, 4, 8, 40])("removes the entire header without losing script text at width %i", (width) => {
  // Arrange
  const renderers = wrapRenderers(upstream, () => defaultConfig);
  const source = "const x = 1;\ntext(x);";
  const highlighted = highlightCode(source, "javascript").join("\n");

  // Act
  const output = renderCall(renderers, renderContext(), source, width);

  // Assert
  expect(output).toBe(plain(new Text(highlighted, 0, 0), width));
});

it("recognizes a styled header without changing the remaining components", () => {
  // Arrange
  const component = new Container();
  const script = new Text("text(1);", 0, 0);
  component.addChild(new Text("\u001b[1m\u001b[31mcodemode\u001b[0m", 0, 0));
  component.addChild(script);
  const renderers = wrapRenderers({ renderCall: () => component }, () => defaultConfig);

  // Act
  const output = renderCall(renderers);

  // Assert
  expect(output).toBe("text(1);");
  expect(component.children).toEqual([script]);
});

it.each([42, false, {}, []])("preserves invalid-argument diagnostics for %j", (code) => {
  // Arrange
  const renderers = wrapRenderers(upstream, () => defaultConfig);

  // Act / Assert
  expect(renderCall(renderers, renderContext(), code)).toBe("codemode [invalid arg]");
});

it.each(["", null])("does not leave an empty header line for code=%j", (code) => {
  // Arrange
  const original = { ...upstream, renderCall: vi.fn(upstream.renderCall) };
  const renderers = wrapRenderers(original, () => defaultConfig);

  // Act
  const output = renderCall(renderers, renderContext(), code);

  // Assert
  expect(output).toBe("");
  expect(original.renderCall.mock.results[0]?.value).toMatchObject({ children: [] });
});

it("preserves an unfamiliar call component", () => {
  // Arrange
  const component = new Text("codemode", 0, 0);
  const renderers = wrapRenderers({ renderCall: () => component }, () => defaultConfig);

  // Act / Assert
  expect(renderCall(renderers)).toBe("codemode");
});

it.each(["", "custom header", "codemode [invalid arg]"])("preserves an unrecognized container header: %j", (header) => {
  // Arrange
  const component = new Container();
  if (header) {
    component.addChild(new Text(header, 0, 0));
  }
  const children = [...component.children];
  const renderers = wrapRenderers({ renderCall: () => component }, () => defaultConfig);

  // Act
  const output = renderCall(renderers);

  // Assert
  expect(output).toBe(header);
  expect(component.children).toEqual(children);
});

it("reuses the component while streaming and toggling header visibility", () => {
  // Arrange
  const original = { ...upstream, renderCall: vi.fn(upstream.renderCall) };
  const config = { ...defaultConfig };
  const renderers = wrapRenderers(original, () => config);
  const component = new Container();
  const context = { ...renderContext(), argsComplete: false, lastComponent: component };
  const source = "codemode\ntext(1);";

  // Act
  const partial = renderCall(renderers, context, "codemode");
  const streamed = renderCall(renderers, context, source);
  context.argsComplete = true;
  config.hideHeader = false;
  const shown = renderCall(renderers, context, source);
  config.hideHeader = true;
  const hidden = renderCall(renderers, context, source);

  // Assert
  expect(partial).toBe("codemode");
  expect(streamed).toBe(source);
  expect(shown).toBe("codemode\n" + source);
  expect(hidden).toBe(source);
  expect(original.renderCall.mock.results.every((result) => result.value === component)).toBe(true);
});

it("preserves streaming source, options lines, and wrapping", () => {
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
