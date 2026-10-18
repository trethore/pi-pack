import type { Theme } from "@earendil-works/pi-coding-agent";
import { parseColor, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { DEFAULT_LIVE_COLOR } from "#src/constants";

export function createMetricsWidget(
  text: string,
  theme: Pick<Theme, "style">,
  liveColor = DEFAULT_LIVE_COLOR,
): Component {
  const fg = liveColor === DEFAULT_LIVE_COLOR ? DEFAULT_LIVE_COLOR : parseColor(liveColor);
  const lines = text.split("\n");
  return {
    render(width) {
      return lines.map((line) => {
        const content = truncateToWidth(line, width);
        const padding = " ".repeat(Math.max(0, width - visibleWidth(content)));
        return padding + theme.style(content, { fg });
      });
    },
    invalidate() {},
  };
}
