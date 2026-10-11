import { createConfigLoader } from "@pi-pack/shared/config";
import { booleanOption } from "@pi-pack/shared/validation";

interface CodemodeConfig {
  prettyResults: boolean;
}

export const loadConfig = createConfigLoader({
  name: "pi-tytoo-codemode",
  knownKeys: ["prettyResults"],
  defaults: (): CodemodeConfig => ({ prettyResults: true }),
  validate(value): CodemodeConfig {
    return { prettyResults: booleanOption(value.prettyResults, "prettyResults", true) };
  },
});
