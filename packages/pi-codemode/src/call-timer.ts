import { type Component, Text } from "@earendil-works/pi-tui";

const NO_PADDING = 0;
const MS_PER_SECOND = 1000;

interface TimingContext {
	executionStarted: boolean;
	isPartial: boolean;
	durationMs: number | undefined;
	invalidate: () => void;
}

const Phase = { Waiting: "waiting", Running: "running", Finished: "finished" } as const;

type Clock =
	| { phase: typeof Phase.Waiting }
	| { phase: typeof Phase.Running; start: number; invalidate: () => void }
	| { phase: typeof Phase.Finished; elapsed: number | undefined };

export class CallTimer extends Text {
	private clock: Clock = { phase: Phase.Waiting };
	private tick: NodeJS.Timeout | undefined;

	constructor() {
		super("", NO_PADDING, NO_PADDING);
	}

	static forRow(previous?: Component): CallTimer {
		if (previous instanceof CallTimer) {
			return previous;
		}
		return new CallTimer();
	}

	private elapsedMs(): number | undefined {
		if (this.clock.phase === Phase.Finished) {
			return this.clock.elapsed;
		}
		if (this.clock.phase === Phase.Running) {
			return performance.now() - this.clock.start;
		}
		return undefined;
	}

	duration(context: TimingContext): string | undefined {
		const finishing = !context.isPartial && this.clock.phase !== Phase.Finished;
		const starting = context.executionStarted && this.clock.phase === Phase.Waiting;
		if (finishing) {
			clearTimeout(this.tick);
			this.clock = { phase: Phase.Finished, elapsed: context.durationMs ?? this.elapsedMs() };
		} else if (starting) {
			this.clock = { phase: Phase.Running, start: performance.now(), invalidate: context.invalidate };
		}

		const ms = this.elapsedMs();
		if (ms === undefined) {
			return undefined;
		}
		return `${Math.floor(ms / MS_PER_SECOND)}s`;
	}

	override render(width: number): readonly string[] {
		// Schedule from render so a row removed mid-execution cannot keep requesting redraws.
		const { clock } = this;
		const needsTick = clock.phase === Phase.Running && this.tick === undefined;
		if (needsTick) {
			const { invalidate } = clock;
			this.tick = setTimeout(() => {
				this.tick = undefined;
				invalidate();
			}, MS_PER_SECOND);
		}
		return super.render(width);
	}
}
