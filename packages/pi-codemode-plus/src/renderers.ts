import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import type { CodemodePlusConfig } from "#src/config";
import { formatOutputText } from "#src/output";

export function wrapRenderers(original: ToolRenderers, getConfig: () => CodemodePlusConfig): ToolRenderers {
  const { renderCall, renderResult } = original;
  return {
    ...original,
    ...(renderCall && {
      renderCall(args, theme, context) {
        const config = getConfig();
        const showFullScript = config.enabled && config.showFullScript;
        return renderCall(args, theme, showFullScript ? { ...context, expanded: true } : context);
      },
    }),
    ...(renderResult && {
      renderResult(result, options, theme, context) {
        const config = getConfig();
        if (!config.enabled || !config.prettyPrintOutput || options.isPartial) {
          return renderResult(result, options, theme, context);
        }
        const content = result.content.map((block) => {
          if (block.type !== "text") {
            return block;
          }
          const text = formatOutputText(block.text);
          return text === block.text ? block : { ...block, text };
        });
        return renderResult({ ...result, content }, options, theme, context);
      },
    }),
  };
}
