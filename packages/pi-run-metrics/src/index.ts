import { RunMetricsConfig } from "#src/config";
import { RunMetricsController } from "#src/controller";
import { RunMetricsWidget } from "#src/widget";
import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";

const widgetKey = "pi-run-metrics";
const refreshMs = 1000;

export default function runMetrics(pi: ExtensionAPI): void {
	const config = RunMetricsConfig.read();
	if (!config.enabled) {
		return;
	}
	const controller = new RunMetricsController();
	const view = {
		timer: undefined as ReturnType<typeof setInterval> | undefined,
		stop(): void {
			clearInterval(this.timer);
			this.timer = undefined;
		},
		show(ctx: ExtensionContext): void {
			if (ctx.hasUI) {
				ctx.ui.setWidget(widgetKey, () => new RunMetricsWidget(() => controller.format(config.format)), {
					placement: "aboveEditor",
				});
			}
		},
	};

	pi.on(Events.SessionStart, (_event, ctx) => {
		view.stop();
		controller.reset();
		view.show(ctx);
	});
	pi.on(Events.AgentStart, (_event, ctx) => {
		controller.start();
		view.stop();
		view.show(ctx);
		if (ctx.hasUI) {
			view.timer = setInterval(() => view.show(ctx), refreshMs);
			view.timer.unref();
		}
	});
	pi.on(Events.MessageEnd, (event, ctx) => {
		if (event.message.role === "assistant") {
			controller.record(event.message);
			view.show(ctx);
		}
	});
	pi.on(Events.AgentSettled, (_event, ctx) => {
		controller.settle();
		view.stop();
		view.show(ctx);
	});
	pi.on(Events.SessionShutdown, (_event, ctx) => {
		view.stop();
		controller.reset();
		if (ctx.hasUI) {
			ctx.ui.setWidget(widgetKey, undefined);
		}
	});
}
