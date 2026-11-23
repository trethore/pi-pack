import { RunMetricsConfig } from "#src/config";
import { RunMetricsController } from "#src/controller";
import { RunMetricsWidget } from "#src/widget";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";

const WIDGET_KEY = "pi-run-metrics";
const WIDGET_COLOR = "accent";
const WIDGET_PLACEMENT = "aboveEditor";
const ASSISTANT_ROLE = "assistant";
const REFRESH_MS = 1000;

export default async function runMetrics(pi: ExtensionAPI): Promise<void> {
	const config = await RunMetricsConfig.read();
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
				ctx.ui.setWidget(
					WIDGET_KEY,
					(_tui, theme) => new RunMetricsWidget(() => theme.fg(WIDGET_COLOR, controller.format(config.format))),
					{ placement: WIDGET_PLACEMENT },
				);
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
			view.timer = setInterval(() => view.show(ctx), REFRESH_MS);
			view.timer.unref();
		}
	});
	pi.on(Events.MessageEnd, (event, ctx) => {
		if (event.message.role === ASSISTANT_ROLE) {
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
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		}
	});
}
