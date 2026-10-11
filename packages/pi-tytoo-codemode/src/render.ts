import {
  highlightCode,
  keyHint,
  truncateToVisualLines,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { codemodeSchema } from "#src/tool";
import type { CodemodeNestedCall, CodemodeToolDetails } from "#src/types";

function preview(text: string, lines: number, theme: Theme): Component {
  return {
    render(width) {
      const result = truncateToVisualLines(text, lines, width, 0, "start");
      if (result.skippedCount > 0) {
        result.visualLines.push(
          truncateToWidth(
            `${theme.fg("muted", `... (${result.skippedCount} more lines)`)} ${keyHint("app.tools.expand", "to expand")}`,
            width,
          ),
        );
      }
      return result.visualLines;
    },
    invalidate() {},
  };
}

function formatCall(call: CodemodeNestedCall, theme: Theme, expanded: boolean): string {
  const args = expanded ? call.args : call.args.slice(0, 80);
  const color = call.status === "error" ? "error" : call.status === "ok" ? "success" : "muted";
  const duration = call.durationMs === undefined ? "" : ` ${(call.durationMs / 1000).toFixed(1)}s`;
  const cost = call.cost === undefined ? "" : ` $${call.cost.toPrecision(3)}`;
  const error = expanded && call.error ? `\n${theme.fg("error", call.error)}` : "";
  return `${theme.fg(color, `[${call.status}]`)} ${theme.fg("toolTitle", call.name)} ${theme.fg("muted", args + duration + cost)}${error}`;
}

export function createRenderers(): Pick<
  ToolDefinition<typeof codemodeSchema, CodemodeToolDetails | undefined>,
  "renderCall" | "renderResult"
> {
  return {
    renderCall(args, theme, context) {
      const component = new Container();
      component.addChild(new Text(theme.fg("toolTitle", theme.bold("codemode")), 0, 0));
      const source = typeof args.code === "string" ? args.code : "[invalid code]";
      const code = highlightCode(source.replace(/\t/g, "    "), "javascript").join("\n");
      component.addChild(context.expanded ? new Text(code, 0, 0) : preview(code, 10, theme));
      return component;
    },
    renderResult(result, options, theme, context) {
      const component = new Container();
      addCalls(component, result.details?.calls ?? [], theme, options.expanded);
      if (options.isPartial) {
        return component;
      }
      const content = result.content.filter(
        (block, index) =>
          !(
            index === 0 &&
            block.type === "text" &&
            /^Script (completed|failed)\nWall time [\d.]+ seconds\nOutput:\n$/.test(block.text)
          ),
      );
      const text = content
        .map((block) => (block.type === "text" ? block.text : context.showImages ? "" : `[Image: ${block.mimeType}]`))
        .join("\n");
      const formatted = text.replace(/\t/g, "    ");
      if (formatted) {
        component.addChild(new Spacer(1));
        const styled = theme.fg(context.isError ? "error" : "toolOutput", formatted);
        component.addChild(options.expanded ? new Text(styled, 0, 0) : preview(styled, 5, theme));
      }
      if (!options.expanded && result.details?.fullOutputPath) {
        component.addChild(new Text(theme.fg("muted", `Full output: ${result.details.fullOutputPath}`), 0, 0));
      }
      return component;
    },
  };
}

function addCalls(component: Container, calls: CodemodeNestedCall[], theme: Theme, expanded: boolean): void {
  const shown = expanded ? calls : calls.slice(-8);
  if (shown.length < calls.length) {
    component.addChild(new Text(theme.fg("muted", `${calls.length - shown.length} earlier calls`), 0, 0));
  }
  if (shown.length > 0) {
    component.addChild(new Text(shown.map((call) => formatCall(call, theme, expanded)).join("\n"), 0, 0));
  }
}
