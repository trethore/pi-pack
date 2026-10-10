import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/shared/events";
import { loadConfig } from "#src/config";
import { formatBashOutput } from "#src/format";

export default function codemodePlus(pi: ExtensionAPI): void {
  let enabled = false;
  let prettyBash = true;

  pi.on(Events.SessionStart, async (_event, ctx) => {
    enabled = false;
    const config = await loadConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui });
    enabled = config.enabled;
    prettyBash = config.prettyBash;
  });

  pi.registerToolRenderer((toolName, next) => {
    const renderers = next();
    const renderResult = renderers?.renderResult;
    if (toolName !== "codemode" || !renderResult) {
      return renderers;
    }
    return {
      ...renderers,
      renderResult(result, options, theme, context) {
        if (!enabled || !prettyBash || options.isPartial) {
          return renderResult(result, options, theme, context);
        }
        const content = result.content.map((block) => {
          if (block.type !== "text") {
            return block;
          }
          const text = formatBashOutput(block.text);
          return text === block.text ? block : { ...block, text };
        });
        const unchanged = content.every((block, index) => block === result.content[index]);
        return renderResult(unchanged ? result : { ...result, content }, options, theme, context);
      },
    };
  });
}
