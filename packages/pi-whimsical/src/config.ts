import { createConfigLoader } from "@pi-pack/config";
import { booleanOption } from "@pi-pack/config/validation";

interface WhimsicalConfig {
  enabled: boolean;
  messages: string[];
}

export const loadConfig = createConfigLoader({
  name: "pi-whimsical",
  knownKeys: ["enabled", "messages"],
  defaults: (): WhimsicalConfig => ({ enabled: true, messages: [] }),
  validate(value): WhimsicalConfig {
    const enabled = booleanOption(value.enabled, "enabled", true);
    const messages = value.messages === undefined ? [] : value.messages;

    if (!Array.isArray(messages) || !messages.every((message: unknown) => typeof message === "string")) {
      throw new Error("messages must be an array of strings");
    }

    return { enabled, messages };
  },
});
