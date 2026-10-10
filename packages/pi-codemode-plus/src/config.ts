import { createConfigLoader } from "@pi-pack/shared/config";
import { booleanOption } from "@pi-pack/shared/validation";

interface CodemodePlusConfig {
  enabled: boolean;
  prettyBash: boolean;
}

function validate(value: Record<string, unknown>): CodemodePlusConfig {
  return {
    enabled: booleanOption(value.enabled, "enabled", true),
    prettyBash: booleanOption(value.prettyBash, "prettyBash", true),
  };
}

export const loadConfig = createConfigLoader({
  name: "pi-codemode-plus",
  knownKeys: ["enabled", "prettyBash"],
  defaults: () => validate({}),
  validate,
});
