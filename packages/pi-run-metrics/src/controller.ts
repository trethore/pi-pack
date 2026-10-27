import type { AgentSettledEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { MetricEvent } from "#metrics/registry.ts";
import { loadConfig } from "#metrics/config.ts";
import { createMetrics } from "#metrics/metrics.ts";
import { colorize, renderLine } from "#metrics/widget.ts";

export function createRunMetricsController() {
	let config: ReturnType<typeof loadConfig> | undefined;
	let metrics = createMetrics();
	let active = false;
	let installed = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let text = "";
	let requestRender: (() => void) | undefined;

	function stop(): void {
		active = false;
		clearInterval(timer);
		timer = undefined;
	}
	function refresh(tickOnly = false): void {
		if (!config) {
			return;
		}
		text = metrics.format(config.format, performance.now(), tickOnly);
		requestRender?.();
	}
	function installWidget(ctx: ExtensionContext, color: string): void {
		colorize(ctx.ui.theme, color);
		refresh();

		ctx.ui.setWidget(
			"pi-run-metrics",
			(tui, theme) => {
				requestRender = () => tui.requestRender();
				const paint = colorize(theme, color);
				return { render: (width) => renderLine(text, width, paint), invalidate() {} };
			},
			{ placement: "aboveEditor" },
		);
		installed = true;
	}

	function initializeSession(ctx: ExtensionContext): void {
		shutdown(ctx);
		config = undefined;
		metrics = createMetrics();
		try {
			config = loadConfig();
			if (!config.enabled || !ctx.hasUI) {
				return;
			}
			installWidget(ctx, config.widgetColor);
		} catch (error) {
			config = undefined;
			if (ctx.hasUI) {
				ctx.ui.notify(
					`pi-run-metrics: Could not load config. Extension inactive until a successful reload. ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
			}
		}
	}

	function startRun(ctx: ExtensionContext): void {
		if (!config?.enabled || !ctx.hasUI || active) {
			return;
		}
		active = true;
		metrics.reset(performance.now());
		refresh();
		timer = setInterval(() => refresh(true), 1000);
		timer.unref();
	}

	function handleMetricEvent(event: MetricEvent, ctx: ExtensionContext): void {
		if (active) {
			metrics.dispatch(event, performance.now(), ctx);
		}
	}
	function refreshUsage(): void {
		if (active) {
			refresh();
		}
	}

	function settleRun(event: AgentSettledEvent, ctx: ExtensionContext): void {
		if (!active) {
			return;
		}
		handleMetricEvent(event, ctx);
		stop();
		refresh();
	}

	function shutdown(ctx: ExtensionContext): void {
		stop();
		if (installed && ctx.hasUI) {
			ctx.ui.setWidget("pi-run-metrics", undefined);
		}
		installed = false;
		requestRender = undefined;
	}

	return { initializeSession, startRun, handleMetricEvent, refreshUsage, settleRun, shutdown };
}
