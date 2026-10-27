import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { createRunMetricsController } from "#metrics/controller.ts";
import { MetricEvent } from "#metrics/registry.ts";

export default function runMetrics(pi: ExtensionAPI): void {
	const controller = createRunMetricsController();

	pi.on(Events.SessionStart, (_event, ctx) => controller.initializeSession(ctx));
	pi.on(Events.SessionShutdown, (_event, ctx) => controller.shutdown(ctx));
	pi.on(Events.AgentStart, (_event, ctx) => controller.startRun(ctx));
	pi.on(MetricEvent.AgentSettled, controller.settleRun);
	pi.on(MetricEvent.MessageStart, controller.handleMetricEvent);
	pi.on(MetricEvent.MessageUpdate, controller.handleMetricEvent);
	pi.on(MetricEvent.MessageEnd, controller.handleMetricEvent);
	pi.on(Events.ToolExecutionEnd, controller.refreshUsage);
}
