import type { ExtensionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { Events } from "@pi-pack/events";

export const MetricEvent = {
	MessageStart: Events.MessageStart,
	MessageUpdate: Events.MessageUpdate,
	MessageEnd: Events.MessageEnd,
	AgentSettled: Events.AgentSettled,
} as const;

export type MetricEvent = Extract<ExtensionEvent, { type: (typeof MetricEvent)[keyof typeof MetricEvent] }>;
type Subscriptions = {
	[K in MetricEvent["type"]]?: (event: Extract<MetricEvent, { type: K }>, now: number, ctx: ExtensionContext) => void;
};

export interface Metric {
	name: string;
	refreshEverySecond?: boolean;
	reset(now: number): void;
	format(now: number): string;
	subscriptions: Subscriptions;
}

export class MetricRegistry {
	private readonly metrics: Metric[];
	private readonly values = new Map<string, string>();
	constructor(metrics: Metric[]) {
		this.metrics = metrics;
		if (new Set(metrics.map((metric) => metric.name)).size !== metrics.length) {
			throw new Error("Duplicate metric name");
		}
	}
	reset(now: number): void {
		this.values.clear();
		for (const metric of this.metrics) {
			metric.reset(now);
		}
	}
	dispatch(event: MetricEvent, now: number, ctx: ExtensionContext): void {
		for (const { subscriptions } of this.metrics) {
			// Narrow the discriminated union before calling each typed subscription.
			switch (event.type) {
				case MetricEvent.MessageStart:
					subscriptions[MetricEvent.MessageStart]?.(event, now, ctx);
					break;
				case MetricEvent.MessageUpdate:
					subscriptions[MetricEvent.MessageUpdate]?.(event, now, ctx);
					break;
				case MetricEvent.MessageEnd:
					subscriptions[MetricEvent.MessageEnd]?.(event, now, ctx);
					break;
				case MetricEvent.AgentSettled:
					subscriptions[MetricEvent.AgentSettled]?.(event, now, ctx);
					break;
			}
		}
	}
	format(template: string, now: number, tickOnly = false): string {
		for (const metric of this.metrics) {
			if (!tickOnly || metric.refreshEverySecond || !this.values.has(metric.name)) {
				this.values.set(metric.name, metric.format(now));
			}
		}
		return template.replace(
			/<([a-z_]+)>/gu,
			(placeholder: string, name: string) => this.values.get(name) ?? placeholder,
		);
	}
}
