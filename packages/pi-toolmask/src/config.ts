import { createConfigLoader } from "@pi-pack/shared/config";
import { booleanOption } from "@pi-pack/shared/validation";

export interface ToolmaskConfig {
  enabled: boolean;
  enforceBeforeAgentStart: boolean;
  masks: string[];
}

export const disabledConfig: ToolmaskConfig = {
  enabled: false,
  enforceBeforeAgentStart: false,
  masks: [],
};

function parseMasks(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("masks must be an array of strings");
  const values: unknown[] = value;
  const masks: string[] = [];
  for (const mask of values) {
    if (typeof mask !== "string" || mask.length === 0 || mask === "!") {
      throw new Error("Each mask must be a nonempty string with a pattern after !");
    }
    masks.push(mask);
  }
  return masks;
}

export const loadConfig = createConfigLoader({
  name: "pi-toolmask",
  defaults: (): ToolmaskConfig => ({ ...disabledConfig, masks: [] }),
  validate(value): ToolmaskConfig {
    return {
      enabled: booleanOption(value.enabled, "enabled", true),
      enforceBeforeAgentStart: booleanOption(value.enforceBeforeAgentStart, "enforceBeforeAgentStart", false),
      masks: parseMasks(value.masks),
    };
  },
});
