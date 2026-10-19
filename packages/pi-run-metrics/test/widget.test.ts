import type { Theme, ThemeToken } from "@earendil-works/pi-coding-agent";
import { parseColor, styleText, visibleWidth } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vitest";
import type { WidgetColor } from "#src/colors";
import { createTestTheme } from "#test/theme";
import { createMetricsWidget } from "#src/widget";

const colors = createTestTheme().colors;
const plainTheme = { colors, style: (text: string) => text };

it("aligns metrics against the right edge and adapts to resizing", () => {
  // Arrange
  const widget = createMetricsWidget("1s | 20 tok/s", plainTheme);

  // Act / Assert
  expect(widget.render(20)).toEqual(["       1s | 20 tok/s"]);
  widget.invalidate();
  expect(widget.render(16)).toEqual(["   1s | 20 tok/s"]);
});

it("measures terminal cells rather than string length", () => {
  // Arrange
  const text = "\u001b[32m\u754c\u001b[0m \u2191 10";
  const widget = createMetricsWidget(text, plainTheme);

  // Act
  const lines = widget.render(12);

  // Assert
  expect(lines).toEqual(["     " + text]);
  expect(visibleWidth(lines[0] ?? "")).toBe(12);
});

it.each([0, 1, 2, 3, 4, 10])("keeps long metrics within a %i-column terminal", (width) => {
  // Arrange
  const widget = createMetricsWidget("1m8s | 42.7 tok/s | input output cost", plainTheme);

  // Act
  const lines = widget.render(width);

  // Assert
  expect(lines).toHaveLength(1);
  expect(visibleWidth(lines[0] ?? "")).toBe(width);
});

it("aligns each line of a multiline format separately", () => {
  // Arrange
  const widget = createMetricsWidget("1s\n$0.01", plainTheme);

  // Act / Assert
  expect(widget.render(8)).toEqual(["      1s", "   $0.01"]);
});

it.each(["#abcdef", "#ABCDEF", "#aBcDeF"] satisfies WidgetColor[])(
  "renders %s as RGB on every line without coloring padding",
  (widgetColor) => {
    // Arrange
    const style = vi.fn<Theme["style"]>((text, { fg }) => {
      if (fg === undefined || typeof fg === "string") {
        throw new Error("Expected a custom color, not a theme token");
      }
      return styleText(text, { fg }, "truecolor");
    });
    const widget = createMetricsWidget("1s\n$0.01", { colors, style }, widgetColor);

    // Act
    const lines = widget.render(8);

    // Assert
    expect(lines).toEqual(["      \u001b[38;2;171;205;239m1s\u001b[39m", "   \u001b[38;2;171;205;239m$0.01\u001b[39m"]);
    expect(style).toHaveBeenCalledWith("1s", { fg: parseColor(widgetColor) });
    expect(lines.map(visibleWidth)).toEqual([8, 8]);
  },
);

it.each([0, 1, 2, 3, 4, 10])("keeps colored metrics within a %i-column terminal", (width) => {
  // Arrange
  const style = vi.fn<Theme["style"]>((text) => `\u001b[36m${text}\u001b[39m`);
  const widget = createMetricsWidget("1m8s | 42.7 tok/s | input output cost", { colors, style });

  // Act
  const lines = widget.render(width);

  // Assert
  expect(lines).toHaveLength(1);
  expect(visibleWidth(lines[0] ?? "")).toBe(width);
  expect(lines[0]?.startsWith("\u001b[36m")).toBe(true);
  expect(lines[0]?.endsWith("\u001b[39m")).toBe(true);
});

it.each(Object.keys(colors) as ThemeToken[])("renders theme token %s with a real theme", (widgetColor) => {
  // Arrange
  const theme = createTestTheme();
  const widget = createMetricsWidget("1s\n$0.01", theme, widgetColor);

  // Act
  const lines = widget.render(8);

  // Assert
  expect(lines).toEqual([`      \u001b[38;2;171;205;239m1s\u001b[39m`, `   \u001b[38;2;171;205;239m$0.01\u001b[39m`]);
  expect(lines.map(visibleWidth)).toEqual([8, 8]);
});

it.each(["accent", "success", "muted", "thinkingHigh", "selectedBg"] as const)(
  "resolves theme token %s again on each render",
  (widgetColor) => {
    // Arrange
    const theme = createTestTheme();
    let currentColors = theme.colors;
    const style = vi.fn<Theme["style"]>((text) => text);
    const widget = createMetricsWidget(
      "1s",
      {
        style,
        get colors() {
          return currentColors;
        },
      },
      widgetColor,
    );

    // Act / Assert
    widget.render(4);
    expect(style).toHaveBeenLastCalledWith("1s", { fg: parseColor("#abcdef") });
    currentColors = { ...currentColors, [widgetColor]: parseColor("#fedcba") };
    widget.invalidate();
    widget.render(4);
    expect(style).toHaveBeenLastCalledWith("1s", { fg: parseColor("#fedcba") });
  },
);
