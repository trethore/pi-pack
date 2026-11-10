import { type Metric, MetricEvent, MetricRegistry } from "#metrics/registry";

export function formatDuration(milliseconds: number): string {
	const total = Math.max(0, Math.floor(milliseconds / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	return `${hours ? `${hours}h` : ""}${hours || minutes ? `${minutes}m` : ""}${total % 60}s`;
}

function elapsed(): Metric {
	let start: number | undefined;
	let end: number | undefined;
	return {
		name: "timetaken",
		refreshEverySecond: true,
		reset(now) {
			start = now;
			end = undefined;
		},
		format(now) {
			return formatDuration(start === undefined ? 0 : (end ?? now) - start);
		},
		subscriptions: {
			[MetricEvent.AgentSettled](_event, now) {
				end = now;
			},
		},
	};
}

function tokens(name: string, field: "input" | "output"): Metric {
	let total = 0;
	return {
		name,
		reset() {
			total = 0;
		},
		format() {
			return String(total);
		},
		subscriptions: {
			[MetricEvent.MessageEnd]({ message }) {
				if (message.role === "assistant") {
					total += message.usage[field];
				}
			},
		},
	};
}

function cost(): Metric {
	let total = 0;
	let known = true;
	return {
		name: "cost",
		reset() {
			total = 0;
			known = true;
		},
		format() {
			return known ? `$${total.toFixed(4)}` : "N/A";
		},
		subscriptions: {
			[MetricEvent.MessageEnd]({ message }, _now, ctx) {
				if (message.role !== "assistant") {
					return;
				}
				const model = ctx.modelRegistry.find(message.provider, message.model);
				known &&= model !== undefined && Number.isFinite(message.usage.cost.total);
				total += message.usage.cost.total;
			},
		},
	};
}

function throughput(): Metric {
	let turnStart: number | undefined;
	let duration = 0;
	let output = 0;
	let measurable = true;
	return {
		name: "tokps",
		reset() {
			turnStart = undefined;
			duration = 0;
			output = 0;
			measurable = true;
		},
		format() {
			return measurable && duration > 0 ? `${(output / (duration / 1000)).toFixed(1)} tok/s` : "N/A";
		},
		subscriptions: {
			[MetricEvent.TurnStart](_event, now) {
				turnStart = now;
			},
			[MetricEvent.MessageEnd]({ message }, now) {
				if (message.role !== "assistant") {
					return;
				}
				if (message.usage.output > 0) {
					// Include first-chunk latency, but never include time spent executing tools.
					if (turnStart === undefined || now <= turnStart) {
						measurable = false;
					} else {
						duration += now - turnStart;
						output += message.usage.output;
					}
				}
				turnStart = undefined;
			},
		},
	};
}

export function createMetrics(): MetricRegistry {
	return new MetricRegistry([
		elapsed(),
		throughput(),
		tokens("input_tokens", "input"),
		tokens("output_tokens", "output"),
		cost(),
	]);
}
