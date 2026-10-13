import { startToolTimer, toolTimerText, type TimedRenderContext, type ToolTimerState } from "#src/render-timer";
import {
  highlightCode,
  keyHint,
  truncateToVisualLines,
  type Theme,
  type ThemeColor,
  type ToolRenderResultOptions,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { Container, Spacer, Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { formatPrettyResult } from "#src/pretty-results";
import type { codemodeSchema } from "#src/tool";
import type { CodemodeNestedCall, CodemodeToolDetails, CodemodeToolInput } from "#src/types";

const COLLAPSED_ARGS_PREVIEW_CHARS = 60;
const EXPANDED_ARGS_PREVIEW_CHARS = 120;
const OUTPUT_PREVIEW_LINES = 5;
const RECENT_CALL_LIMIT = 8;

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
  let color: ThemeColor = "muted";
  if (call.status === "error") {
    color = "error";
  } else if (call.status === "ok") {
    color = "success";
  }

  const duration = call.durationMs === undefined ? "" : ` ${(call.durationMs / 1000).toFixed(1)}s`;
  const cost = call.cost === undefined ? "" : ` $${call.cost.toPrecision(3)}`;

  const maxChars = expanded ? EXPANDED_ARGS_PREVIEW_CHARS : COLLAPSED_ARGS_PREVIEW_CHARS;
  const argsPreview = call.args.slice(0, maxChars);
  const newline = argsPreview.search(/[\r\n]/);
  const args = newline < 0 ? argsPreview : argsPreview.slice(0, newline);

  return `${theme.fg(color, `[${call.status}]`)} ${theme.fg("toolTitle", call.name)} ${theme.fg("muted", args + duration + cost)}`;
}

export function createRenderers(
  getPrettyResults: () => boolean = () => true,
): Pick<
  ToolDefinition<typeof codemodeSchema, CodemodeToolDetails | undefined, ToolTimerState>,
  "renderCall" | "renderResult"
> {
  return {
    renderCall,
    renderResult: (result, options, theme, context) =>
      renderResult(result, options, theme, context, getPrettyResults()),
  };
}

function renderCall(args: CodemodeToolInput, _theme: Theme, context: TimedRenderContext): Component {
  startToolTimer(context);
  const source = typeof args.code === "string" ? args.code : "[invalid code]";
  const code = highlightCode(source.replace(/\t/g, "    "), "javascript").join("\n");
  return new Text(code, 0, 0);
}

function renderResult(
  result: AgentToolResult<CodemodeToolDetails | undefined>,
  options: ToolRenderResultOptions,
  theme: Theme,
  context: TimedRenderContext,
  prettyResults: boolean,
): Component {
  const component = new Container();
  const timer = toolTimerText(context, options.isPartial);
  addCalls(component, result.details?.calls ?? [], theme, options.expanded);
  if (options.isPartial) {
    addTimer(component, timer, theme);
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
    .map((block) => {
      if (block.type === "text") {
        return prettyResults ? formatPrettyResult(block.text) : block.text;
      }
      return context.showImages ? "" : `[Image: ${block.mimeType}]`;
    })
    .join("\n");
  const formatted = text.replace(/\t/g, "    ");

  if (formatted) {
    component.addChild(new Spacer(1));
    const styled = theme.fg(context.isError ? "error" : "toolOutput", formatted);
    component.addChild(options.expanded ? new Text(styled, 0, 0) : preview(styled, OUTPUT_PREVIEW_LINES, theme));
  }

  if (!options.expanded && result.details?.fullOutputPath) {
    component.addChild(new Text(theme.fg("muted", `Full output: ${result.details.fullOutputPath}`), 0, 0));
  }

  addTimer(component, timer, theme);
  return component;
}

function addTimer(component: Container, timer: string | undefined, theme: Theme): void {
  if (timer) {
    component.addChild(new Spacer(1));
    component.addChild(new Text(theme.fg("muted", timer), 0, 0));
  }
}

function addCalls(component: Container, calls: CodemodeNestedCall[], theme: Theme, expanded: boolean): void {
  const shown = expanded ? calls : calls.slice(-RECENT_CALL_LIMIT);
  if (shown.length < calls.length) {
    component.addChild(new Text(theme.fg("muted", `${calls.length - shown.length} earlier calls`), 0, 0));
  }

  if (shown.length > 0) {
    component.addChild(new Text(shown.map((call) => formatCall(call, theme, expanded)).join("\n"), 0, 0));
  }
}
