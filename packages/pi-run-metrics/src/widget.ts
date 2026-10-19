import type { Theme } from "@earendil-works/pi-coding-agent";
import { parseColor, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { isThemeToken, type WidgetColor } from "#src/colors";
import { DEFAULT_WIDGET_COLOR } from "#src/constants";

export function createMetricsWidget(
  text: string,
  theme: Pick<Theme, "style" | "colors">,
  widgetColor: WidgetColor = DEFAULT_WIDGET_COLOR,
): Component {
  const lines = text.split("\n");
  return {
    render(width) {
      const fg = isThemeToken(widgetColor, theme) ? theme.colors[widgetColor] : parseColor(widgetColor);
      return lines.map((line) => {
        const content = truncateToWidth(line, width);
        const padding = " ".repeat(Math.max(0, width - visibleWidth(content)));
        return padding + theme.style(content, { fg });
      });
    },
    invalidate() {},
  };
}
