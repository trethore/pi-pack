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

const ZERO = 0;
const MILLISECONDS_PER_SECOND = 1000;
const SPEED_PRECISION = 1;
const COST_PRECISION = 4;
const SPEED_UNIT = "tok/s";
const CURRENCY_SYMBOL = "$";

const Metric = {
	timetaken(run: RunSnapshot): string {
		return Duration.format(run.elapsedMs);
	},
	tokps(run: RunSnapshot): string {
		let speed = ZERO;
		if (run.responseMs > ZERO) {
			speed = run.outputTokens / (run.responseMs / MILLISECONDS_PER_SECOND);
		}
		return `${speed.toFixed(SPEED_PRECISION)} ${SPEED_UNIT}`;
	},
	input_tokens(run: RunSnapshot): string {
		return String(run.inputTokens);
	},
	output_tokens(run: RunSnapshot): string {
		return String(run.outputTokens);
	},
	cost(run: RunSnapshot): string {
		return `${CURRENCY_SYMBOL}${run.cost.toFixed(COST_PRECISION)}`;
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
