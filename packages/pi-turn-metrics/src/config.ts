import type { Theme } from "@earendil-works/pi-coding-agent";
import { createConfigLoader } from "@pi-pack/shared/config";
import { booleanOption } from "@pi-pack/shared/validation";
import { isLiveColor, type LiveColor } from "#src/colors";
import { DEFAULT_LIVE_COLOR, EXTENSION_NAME } from "#src/constants";

interface MetricsConfig {
  enabled: boolean;
  mode: "notify" | "live";
  format: string;
  liveColor: LiveColor;
}

const defaultFormat = "<timetaken> | <tokps> | \u2191 <input_tokens> \u2193 <output_tokens> | <cost>";

export function createMetricsConfigLoader(theme: Pick<Theme, "colors">) {
  return createConfigLoader({
    name: EXTENSION_NAME,
    knownKeys: ["enabled", "mode", "format", "liveColor"],
    defaults: (): MetricsConfig => ({
      enabled: true,
      mode: "live",
      format: defaultFormat,
      liveColor: DEFAULT_LIVE_COLOR,
    }),
    validate(value): MetricsConfig {
      const enabled = booleanOption(value.enabled, "enabled", true);
      const mode = value.mode === undefined ? "live" : value.mode;

      if (mode !== "notify" && mode !== "live") {
        throw new Error('mode must be "notify" or "live"');
      }
      const format = value.format === undefined ? defaultFormat : value.format;

      if (typeof format !== "string") {
        throw new Error("format must be a string");
      }
      const liveColor = value.liveColor === undefined ? DEFAULT_LIVE_COLOR : value.liveColor;

      if (!isLiveColor(liveColor, theme)) {
        throw new Error("liveColor must be a theme color token or a hex color in #rrggbb format");
      }
      return { enabled, mode, format, liveColor };
    },
  });
}
