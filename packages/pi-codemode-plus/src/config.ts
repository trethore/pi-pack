import { createConfigLoader } from "@pi-pack/shared/config";
import { booleanOption } from "@pi-pack/shared/validation";

const ConfigKey = {
  ENABLED: "enabled",
  PRETTY_PRINT_OUTPUT: "prettyPrintOutput",
  SHOW_FULL_SCRIPT: "showFullScript",
} as const;
type ConfigKey = (typeof ConfigKey)[keyof typeof ConfigKey];

export type CodemodePlusConfig = Record<ConfigKey, boolean>;

export const defaultConfig: CodemodePlusConfig = {
  [ConfigKey.ENABLED]: true,
  [ConfigKey.PRETTY_PRINT_OUTPUT]: true,
  [ConfigKey.SHOW_FULL_SCRIPT]: true,
};

export const loadConfig = createConfigLoader({
  name: "pi-codemode-plus",
  knownKeys: Object.values(ConfigKey),
  defaults: () => ({ ...defaultConfig }),
  validate(value): CodemodePlusConfig {
    const option = (key: ConfigKey) => booleanOption(value[key], key, defaultConfig[key]);
    return {
      [ConfigKey.ENABLED]: option(ConfigKey.ENABLED),
      [ConfigKey.PRETTY_PRINT_OUTPUT]: option(ConfigKey.PRETTY_PRINT_OUTPUT),
      [ConfigKey.SHOW_FULL_SCRIPT]: option(ConfigKey.SHOW_FULL_SCRIPT),
    };
  },
});
