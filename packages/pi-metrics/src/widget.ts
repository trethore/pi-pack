import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

export function createMetricsWidget(text: string): Component {
  const lines = text.split("\n");
  return {
    render(width) {
      return lines.map((line) => {
        const content = truncateToWidth(line, width);
        const padding = " ".repeat(Math.max(0, width - visibleWidth(content)));
        return padding + content;
      });
    },
    invalidate() {},
  };
}
