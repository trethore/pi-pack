import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/shared/events";
import { loadConfig } from "#src/config";
import { EXTENSION_NAME } from "#src/constants";
import { TurnMetrics } from "#src/metrics";
import { createMetricsWidget } from "#src/widget";

export default function metrics(pi: ExtensionAPI): void {
  let subscriptions: (() => void)[] = [];
  let widgetVisible = false;

  function clearWidget(ctx: ExtensionContext): void {
    if (!widgetVisible) {
      return;
    }
    ctx.ui.setWidget(EXTENSION_NAME, undefined);
    widgetVisible = false;
  }

  pi.on(Events.SessionStart, async (_sessionEvent, ctx) => {
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
    subscriptions = [];
    clearWidget(ctx);
    const config = await loadConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted(), ui: ctx.ui });
    if (!config.enabled || !ctx.hasUI) {
      return;
    }

    const turn = new TurnMetrics(config.format);
    const live = config.mode === "live";

    function updateWidget(context: ExtensionContext): void {
      if (!live || !turn.active) {
        return;
      }
      const text = turn.render();
      context.ui.setWidget(EXTENSION_NAME, (_tui, theme) => createMetricsWidget(text, theme, config.liveColor), {
        placement: "aboveEditor",
      });
      widgetVisible = true;
    }

    subscriptions.push(
      pi.on(Events.AgentStart, (_event, context) => {
        turn.start();
        updateWidget(context);
      }),
      pi.on(Events.AgentSettled, (_event, context) => {
        if (!turn.active) {
          return;
        }
        if (live) {
          updateWidget(context);
        } else {
          context.ui.notify(turn.render(), "info");
        }
        turn.active = false;
      }),
    );

    if (turn.needsSpeed) {
      subscriptions.push(pi.on(Events.BeforeProviderRequest, () => turn.startRequest()));
    }
    if (turn.needsUsage || live) {
      subscriptions.push(
        pi.on(Events.MessageEnd, (event, context) => {
          if (event.message.role !== "assistant" || !turn.active) {
            return;
          }
          turn.completeRequest(event.message);
          updateWidget(context);
        }),
      );
    }
    if (live) {
      subscriptions.push(
        pi.on(Events.ToolExecutionEnd, (_event, context) => updateWidget(context)),
        pi.on(Events.SessionShutdown, (_event, context) => clearWidget(context)),
      );
    }
  });
}
