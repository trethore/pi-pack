import { createConfigLoader } from "@pi-pack/shared/config";
import { booleanOption } from "@pi-pack/shared/validation";
import { EXTENSION_NAME } from "#src/constants";

interface MetricsConfig {
  enabled: boolean;
  mode: "notify" | "live";
  format: string;
}

const defaultFormat = "<timetaken> | <tokps> | \u2191 <input_tokens> \u2193 <output_tokens> | <cost>";

export const loadConfig = createConfigLoader({
  name: EXTENSION_NAME,
  knownKeys: ["enabled", "mode", "format"],
  defaults: (): MetricsConfig => ({ enabled: true, mode: "notify", format: defaultFormat }),
  validate(value): MetricsConfig {
    const enabled = booleanOption(value.enabled, "enabled", true);
    const mode = value.mode === undefined ? "notify" : value.mode;

    if (mode !== "notify" && mode !== "live") {
      throw new Error('mode must be "notify" or "live"');
    }
    const format = value.format === undefined ? defaultFormat : value.format;

    if (typeof format !== "string") {
      throw new Error("format must be a string");
    }
    return { enabled, mode, format };
  },
});
