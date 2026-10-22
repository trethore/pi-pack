import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { createMetricsConfigLoader } from "#src/config";
import { EXTENSION_NAME } from "#src/constants";
import { RunMetrics } from "#src/metrics";
import { createMetricsWidget } from "#src/widget";

export default function metrics(pi: ExtensionAPI): void {
  let subscriptions: (() => void)[] = [];
  let widgetVisible = false;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  function stopRefresh(): void {
    if (refreshTimer === undefined) {
      return;
    }
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }

  function clearWidget(ctx: ExtensionContext): void {
    if (!widgetVisible) {
      return;
    }
    ctx.ui.setWidget(EXTENSION_NAME, undefined);
    widgetVisible = false;
  }

  pi.on(Events.SessionStart, async (_sessionEvent, ctx) => {
    stopRefresh();
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
    subscriptions = [];
    clearWidget(ctx);
    const loadConfig = createMetricsConfigLoader(ctx.ui.theme);
    const config = await loadConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui });
    if (!config.enabled || !ctx.hasUI) {
      return;
    }

    const run = new RunMetrics(config.format);
    const widgetMode = config.mode === "widget";
    let lastText: string | undefined;

    function updateWidget(context: ExtensionContext): void {
      if (!widgetMode || !run.active) {
        return;
      }
      const text = run.render();
      if (widgetVisible && text === lastText) {
        return;
      }
      context.ui.setWidget(EXTENSION_NAME, (_tui, theme) => createMetricsWidget(text, theme, config.widgetColor), {
        placement: "aboveEditor",
      });
      widgetVisible = true;
      lastText = text;
    }

    subscriptions.push(
      pi.on(Events.AgentStart, (_event, context) => {
        run.start();
        updateWidget(context);
        if (widgetMode && run.needsDuration && refreshTimer === undefined) {
          refreshTimer = setInterval(() => updateWidget(context), 1000);
          refreshTimer.unref();
        }
      }),
      pi.on(Events.AgentSettled, (_event, context) => {
        stopRefresh();
        if (!run.active) {
          return;
        }
        if (widgetMode) {
          updateWidget(context);
        } else {
          context.ui.notify(run.render(), "info");
        }
        run.active = false;
      }),
    );

    if (run.needsSpeed) {
      subscriptions.push(pi.on(Events.BeforeProviderRequest, () => run.startRequest()));
    }
    if (run.needsUsage || widgetMode) {
      subscriptions.push(
        pi.on(Events.MessageEnd, (event, context) => {
          if (event.message.role !== "assistant" || !run.active) {
            return;
          }
          run.completeRequest(event.message);
          updateWidget(context);
        }),
      );
    }
    if (widgetMode) {
      subscriptions.push(
        pi.on(Events.ToolExecutionEnd, (_event, context) => updateWidget(context)),
        pi.on(Events.SessionShutdown, (_event, context) => {
          stopRefresh();
          run.active = false;
          clearWidget(context);
        }),
      );
    }
  });
}
