import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/shared/events";
import { defaultConfig, loadConfig } from "#src/config";
import { wrapRenderers } from "#src/renderers";

export default function codemodePlus(pi: ExtensionAPI): void {
  let config = { ...defaultConfig, enabled: false };

  pi.on(Events.SessionStart, async (_event, ctx) => {
    config = { ...defaultConfig, enabled: false };
    config = await loadConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui });
  });

  pi.registerToolRenderer((name, next) => {
    const original = next();
    if (name !== "codemode" || !original) {
      return original;
    }
    return wrapRenderers(original, () => config);
  });
}
