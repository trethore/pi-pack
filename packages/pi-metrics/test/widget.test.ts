import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, it } from "vitest";
import { createMetricsWidget } from "#src/widget";

it("aligns metrics against the right edge and adapts to resizing", () => {
  // Arrange
  const widget = createMetricsWidget("1s | 20 tok/s");

  // Act / Assert
  expect(widget.render(20)).toEqual(["       1s | 20 tok/s"]);
  widget.invalidate();
  expect(widget.render(16)).toEqual(["   1s | 20 tok/s"]);
});

it("measures terminal cells rather than string length", () => {
  // Arrange
  const text = "\u001b[32m\u754c\u001b[0m \u2191 10";
  const widget = createMetricsWidget(text);

  // Act
  const lines = widget.render(12);

  // Assert
  expect(lines).toEqual(["     " + text]);
  expect(visibleWidth(lines[0] ?? "")).toBe(12);
});

it.each([0, 1, 2, 3, 4, 10])("keeps long metrics within a %i-column terminal", (width) => {
  // Arrange
  const widget = createMetricsWidget("1m8s | 42.7 tok/s | input output cost");

  // Act
  const lines = widget.render(width);

  // Assert
  expect(lines).toHaveLength(1);
  expect(visibleWidth(lines[0] ?? "")).toBe(width);
});

it("aligns each line of a multiline format separately", () => {
  // Arrange
  const widget = createMetricsWidget("1s\n$0.01");

  // Act / Assert
  expect(widget.render(8)).toEqual(["      1s", "   $0.01"]);
});
