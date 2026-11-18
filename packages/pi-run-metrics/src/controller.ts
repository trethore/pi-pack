import { MetricRegistry, type RunSnapshot } from "#src/metrics";
import { type ValueOf } from "@a-box-of-scraps/ts-utils";
import { type AssistantMessage } from "@earendil-works/pi-ai";

const ZERO = 0;
const RunState = { Idle: "idle", Running: "running", Settled: "settled" } as const;
type RunState = ValueOf<typeof RunState>;

class RunMetricsController {
	private readonly registry: MetricRegistry;
	private readonly now: () => number;
	private state: RunState = RunState.Idle;
	private startedAt = ZERO;
	private elapsedMs = ZERO;
	private responseMs = ZERO;
	private inputTokens = ZERO;
	private outputTokens = ZERO;
	private cost = ZERO;

	constructor(
		registry: MetricRegistry = MetricRegistry.create(),
		now: () => number = () => performance.now(),
	) {
		this.registry = registry;
		this.now = now;
	}

	start(): void {
		// Retries and queued continuations can start another agent loop before settlement.
		if (this.state === RunState.Running) {
			return;
		}
		this.reset();
		this.startedAt = this.now();
		this.state = RunState.Running;
	}

	record(message: AssistantMessage): void {
		if (this.state !== RunState.Running) {
			return;
		}
		this.inputTokens += message.usage.input;
		this.outputTokens += message.usage.output;
		this.cost += message.usage.cost.total;
		// Legacy/custom streams may omit Pi's monotonic response duration.
		this.responseMs += Math.max(ZERO, message.durationMs ?? Date.now() - message.timestamp);
	}

	settle(): void {
		if (this.state !== RunState.Running) {
			return;
		}
		this.elapsedMs = this.now() - this.startedAt;
		this.state = RunState.Settled;
	}

	reset(): void {
		this.state = RunState.Idle;
		this.startedAt = ZERO;
		this.elapsedMs = ZERO;
		this.responseMs = ZERO;
		this.inputTokens = ZERO;
		this.outputTokens = ZERO;
		this.cost = ZERO;
	}

	format(template: string): string {
		let { elapsedMs } = this;
		if (this.state === RunState.Running) {
			elapsedMs = this.now() - this.startedAt;
		}
		const snapshot: RunSnapshot = {
			elapsedMs,
			responseMs: this.responseMs,
			inputTokens: this.inputTokens,
			outputTokens: this.outputTokens,
			cost: this.cost,
		};
		return MetricRegistry.format(this.registry, template, snapshot);
	}
}

export { RunMetricsController };
