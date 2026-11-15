import { Duration } from "#src/duration";

interface RunSnapshot {
	readonly elapsedMs: number;
	readonly responseMs: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cost: number;
}

type Metric = (snapshot: RunSnapshot) => string;
type MetricRegistry = ReadonlyMap<string, Metric>;

const zero = 0;
const millisecondsPerSecond = 1000;
const speedPrecision = 1;
const costPrecision = 4;

const Metric = {
	timetaken(run: RunSnapshot): string {
		return Duration.format(run.elapsedMs);
	},
	tokps(run: RunSnapshot): string {
		let speed = zero;
		if (run.responseMs > zero) {
			speed = run.outputTokens / (run.responseMs / millisecondsPerSecond);
		}
		return `${speed.toFixed(speedPrecision)} tok/s`;
	},
	input_tokens(run: RunSnapshot): string {
		return String(run.inputTokens);
	},
	output_tokens(run: RunSnapshot): string {
		return String(run.outputTokens);
	},
	cost(run: RunSnapshot): string {
		return `$${run.cost.toFixed(costPrecision)}`;
	},
} satisfies Record<string, Metric>;

const MetricRegistry = {
	create(): Map<string, Metric> {
		return new Map(Object.entries(Metric));
	},
	format(registry: MetricRegistry, format: string, snapshot: RunSnapshot): string {
		return format.replace(
			/<(?<metric>\w+)>/gu,
			(placeholder: string, name: string) => registry.get(name)?.(snapshot) ?? placeholder,
		);
	},
};

export { MetricRegistry, type RunSnapshot };
