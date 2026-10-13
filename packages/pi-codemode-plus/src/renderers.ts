import { stripVTControlCharacters } from "node:util";
import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
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
        const component = renderCall(args, theme, showFullScript ? { ...context, expanded: true } : context);
        if (config.enabled && config.hideHeader && component instanceof Container) {
          const header = component.children[0];
          const title = "codemode";
          if (
            header instanceof Text &&
            stripVTControlCharacters(header.render(title.length).join("\n")).trim() === title
          ) {
            component.removeChild(header);
          }
        }
        return component;
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
