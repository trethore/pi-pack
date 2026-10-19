import type { Theme } from "@earendil-works/pi-coding-agent";
import { createConfigLoader } from "@pi-pack/shared/config";
import { booleanOption } from "@pi-pack/shared/validation";
import { isWidgetColor, type WidgetColor } from "#src/colors";
import { DEFAULT_WIDGET_COLOR, EXTENSION_NAME } from "#src/constants";

interface MetricsConfig {
  enabled: boolean;
  mode: "notify" | "widget";
  format: string;
  widgetColor: WidgetColor;
}

const defaultFormat = "<timetaken> | <tokps> | \u2191 <input_tokens> \u2193 <output_tokens> | <cost>";

export function createMetricsConfigLoader(theme: Pick<Theme, "colors">) {
  return createConfigLoader({
    name: EXTENSION_NAME,
    knownKeys: ["enabled", "mode", "format", "widgetColor"],
    defaults: (): MetricsConfig => ({
      enabled: true,
      mode: "widget",
      format: defaultFormat,
      widgetColor: DEFAULT_WIDGET_COLOR,
    }),
    validate(value): MetricsConfig {
      const enabled = booleanOption(value.enabled, "enabled", true);
      const mode = value.mode === undefined ? "widget" : value.mode;

      if (mode !== "notify" && mode !== "widget") {
        throw new Error('mode must be "notify" or "widget"');
      }
      const format = value.format === undefined ? defaultFormat : value.format;

      if (typeof format !== "string") {
        throw new Error("format must be a string");
      }
      const widgetColor = value.widgetColor === undefined ? DEFAULT_WIDGET_COLOR : value.widgetColor;

      if (!isWidgetColor(widgetColor, theme)) {
        throw new Error("widgetColor must be a theme color token or a hex color in #rrggbb format");
      }
      return { enabled, mode, format, widgetColor };
    },
  });
}
