import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "#src/config";
import { TurnMetrics } from "#src/metrics";
import { createMetricsWidget } from "#src/widget";

export default function metrics(pi: ExtensionAPI): void {
  let subscriptions: (() => void)[] = [];
  let widgetVisible = false;

  function clearWidget(ctx: ExtensionContext): void {
    if (!widgetVisible) return;
    ctx.ui.setWidget("pi-metrics", undefined);
    widgetVisible = false;
  }

  pi.on("session_start", async (_sessionEvent, ctx) => {
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions = [];
    clearWidget(ctx);
    const config = await loadConfig(ctx.cwd);
    if (!config.enabled || !ctx.hasUI) return;

    const turn = new TurnMetrics(config.format);
    const live = config.mode === "live";

    function updateWidget(context: ExtensionContext): void {
      if (!live || !turn.active) return;
      const text = turn.render();
      context.ui.setWidget("pi-metrics", () => createMetricsWidget(text), { placement: "aboveEditor" });
      widgetVisible = true;
    }

    subscriptions.push(
      pi.on("agent_start", (_event, context) => {
        turn.start();
        updateWidget(context);
      }),
      pi.on("agent_settled", (_event, context) => {
        if (!turn.active) return;
        if (live) updateWidget(context);
        else context.ui.notify(turn.render(), "info");
        turn.active = false;
      }),
    );

    if (turn.needsSpeed) {
      // Assistant message_start can arrive after request latency, so time from turn_start instead.
      subscriptions.push(pi.on("turn_start", () => turn.startRequest()));
    }
    if (turn.needsUsage || live) {
      subscriptions.push(
        pi.on("message_end", (event, context) => {
          if (event.message.role !== "assistant" || !turn.active) return;
          turn.completeRequest(event.message);
          updateWidget(context);
        }),
      );
    }
    if (live) {
      subscriptions.push(
        pi.on("tool_execution_end", (_event, context) => updateWidget(context)),
        pi.on("session_shutdown", (_event, context) => clearWidget(context)),
      );
    }
  });
}
