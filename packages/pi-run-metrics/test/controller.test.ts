import { RunMetricsConfig } from "#src/config";
import { RunMetricsController } from "#src/controller";
import { MetricRegistry } from "#src/metrics";
import { Fixtures } from "#test/fixtures";
import { afterEach, expect, test, vi } from "vitest";

const { format } = RunMetricsConfig.read();
const initialTime = 0;
const firstResponseEnd = 12_000;
const runEnd = 66_000;
const later = 120_000;
const fallbackEnd = 20_000;

afterEach(() => {
	vi.restoreAllMocks();
});

test("reports zero metrics before a run and ignores out-of-run responses", () => {
	expect.hasAssertions();
	// Arrange
	const controller = new RunMetricsController();

	// Act
	controller.record(Fixtures.message());
	controller.settle();

	// Assert
	expect(controller.format(format)).toBe(Fixtures.emptyMetricsText);
});

test("sums response usage and duration but includes tool time only in elapsed time", () => {
	expect.hasAssertions();
	// Arrange
	let now = 0;
	const controller = new RunMetricsController(undefined, () => now);
	controller.start();

	// Act
	controller.record(Fixtures.message());
	now = runEnd;
	controller.record(Fixtures.message({ durationMs: 6000 }));
	controller.settle();

	// Assert
	expect(controller.format(format)).toBe("1m6s | 45.6 tok/s | ↑ 2400 ↓ 820 | $0.0084");
});

test("updates elapsed time live without resetting on repeated starts", () => {
	expect.hasAssertions();
	// Arrange
	let now = 0;
	const controller = new RunMetricsController(undefined, () => now);
	controller.start();
	controller.record(Fixtures.message());

	// Act
	now = firstResponseEnd;
	controller.start();

	// Assert
	expect(controller.format(format)).toBe("12s | 34.2 tok/s | ↑ 1200 ↓ 410 | $0.0042");
});

test("freezes at settlement and ignores later responses and settlements", () => {
	expect.hasAssertions();
	// Arrange
	const clock = vi.fn<() => number>().mockReturnValue(initialTime);
	const controller = new RunMetricsController(undefined, clock);
	controller.start();
	controller.settle();

	// Act
	clock.mockReturnValue(later);
	controller.record(Fixtures.message());
	controller.settle();

	// Assert
	expect(controller.format(format)).toBe(Fixtures.emptyMetricsText);
});

test("clears totals when the next run starts", () => {
	expect.hasAssertions();
	// Arrange
	const controller = new RunMetricsController();
	controller.start();
	controller.record(Fixtures.message());
	controller.settle();

	// Act
	controller.start();

	// Assert
	expect(controller.format(format)).toBe(Fixtures.emptyMetricsText);
});

test("uses request timestamps when response duration is unavailable", () => {
	expect.hasAssertions();
	// Arrange
	vi.spyOn(Date, "now").mockReturnValue(fallbackEnd);
	const message = Fixtures.message({ timestamp: 8000 });
	Reflect.deleteProperty(message, "durationMs");
	const controller = new RunMetricsController();
	controller.start();

	// Act
	controller.record(message);

	// Assert
	expect(controller.format("<tokps>")).toBe("34.2 tok/s");
});

test.each([{ durationMs: 0 }, { durationMs: -10 }])(
	"handles response duration $durationMs without invalid speed",
	({ durationMs }) => {
		expect.hasAssertions();
		// Arrange
		const controller = new RunMetricsController();
		controller.start();

		// Act
		controller.record(Fixtures.message({ durationMs, stopReason: "aborted" }));
		controller.settle();

		// Assert
		expect(controller.format("<tokps> <output_tokens>")).toBe("0.0 tok/s 410");
	},
);

test("supports adding and removing metrics without changing the controller", () => {
	expect.hasAssertions();
	// Arrange
	const registry = MetricRegistry.create();
	registry.set("custom", (run) => `${run.inputTokens + run.outputTokens} tokens`);
	registry.delete("cost");
	const controller = new RunMetricsController(registry);
	controller.start();
	controller.record(Fixtures.message());

	// Act
	const text = controller.format("<custom> / <custom> / <cost> / <unknown>");

	// Assert
	expect(text).toBe("1610 tokens / 1610 tokens / <cost> / <unknown>");
});
