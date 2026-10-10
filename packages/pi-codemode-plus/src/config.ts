import { createConfigLoader } from "@pi-pack/shared/config";
import { booleanOption } from "@pi-pack/shared/validation";

const ConfigKey = {
  Enabled: "enabled",
  PrettyBash: "prettyBash",
  PrettyRead: "prettyRead",
} as const;

interface CodemodePlusConfig {
  [ConfigKey.Enabled]: boolean;
  [ConfigKey.PrettyBash]: boolean;
  [ConfigKey.PrettyRead]: boolean;
}

function validate(value: Record<string, unknown>): CodemodePlusConfig {
  return {
    [ConfigKey.Enabled]: booleanOption(value[ConfigKey.Enabled], ConfigKey.Enabled, true),
    [ConfigKey.PrettyBash]: booleanOption(value[ConfigKey.PrettyBash], ConfigKey.PrettyBash, true),
    [ConfigKey.PrettyRead]: booleanOption(value[ConfigKey.PrettyRead], ConfigKey.PrettyRead, true),
  };
}

export const loadConfig = createConfigLoader({
  name: "pi-codemode-plus",
  knownKeys: Object.values(ConfigKey),
  defaults: () => validate({}),
  validate,
});
