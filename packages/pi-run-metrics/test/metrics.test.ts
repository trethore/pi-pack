import { response, delta } from "#metrics-test/fixtures";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { createMetrics, formatDuration } from "#metrics/metrics";
import { MetricRegistry } from "#metrics/registry";
import { renderLine } from "#metrics/widget";

// Only the model lookup surface is needed by metrics.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const context = { modelRegistry: { find: () => ({}) } } as unknown as ExtensionContext;
const format = "<timetaken> | <tokps> | <input_tokens> | <output_tokens> | <cost>";

test.each([
	[0, "0s"],
	[999, "0s"],
	[60000, "1m0s"],
	[3600000, "1h0m0s"],
	[3605000, "1h0m5s"],
])("formats %i milliseconds as %s", (time, expected) => {
	// Arrange / Act
	const result = formatDuration(time);
	// Assert
	expect(result).toBe(expected);
});

test("aggregates generation time excluding initial wait and tools, then freezes and resets", () => {
	// Arrange
	const metrics = createMetrics();
	expect(metrics.format(format, 0)).toBe("0s | N/A | 0 | 0 | $0.0000");
	metrics.reset(0);
	// Act
	metrics.dispatch(delta(), 4000, context);
	metrics.dispatch(response(), 6000, context);
	metrics.dispatch(delta(), 20000, context);
	metrics.dispatch(response(200), 24000, context);
	metrics.dispatch({ type: "agent_settled", aborted: false }, 25000, context);
	// Assert
	expect(metrics.format(format, 90000)).toBe("25s | 50.0 tok/s | 400 | 300 | $0.0084");
	metrics.reset(90000);
	expect(metrics.format(format, 90000)).toBe("0s | N/A | 0 | 0 | $0.0000");
});

test("ticks only elapsed time until a usage refresh", () => {
	// Arrange
	const metrics = createMetrics();
	metrics.reset(0);
	metrics.format(format, 0);
	// Act
	metrics.dispatch(delta(), 1000, context);
	metrics.dispatch(response(), 2000, context);
	// Assert
	expect(metrics.format(format, 3000, true)).toBe("3s | N/A | 0 | 0 | $0.0000");
	expect(metrics.format(format, 3000)).toBe("3s | 100.0 tok/s | 200 | 100 | $0.0042");
});

test("reports unavailable throughput when streaming timing is missing", () => {
	// Arrange
	const metrics = createMetrics();
	metrics.reset(0);
	// Act
	metrics.dispatch(response(), 2000, context);
	// Assert
	expect(metrics.format("<tokps> <unknown>", 2000)).toBe("N/A <unknown>");
});

test("rejects duplicate registrations", () => {
	// Arrange
	const metric = { name: "test", reset() {}, format: () => "0", subscriptions: {} };
	// Act / Assert
	expect(() => new MetricRegistry([metric, metric])).toThrow("Duplicate metric");
});

const paint = (text: string) => text;

test("right aligns using terminal cell width and clips narrow widgets", () => {
	// Arrange
	// Act / Assert
	expect(renderLine("↑ 12", 8, paint)).toEqual(["    ↑ 12"]);
	expect(renderLine("你好", 6, paint)).toEqual(["  你好"]);
	expect(renderLine("long text", 0, paint)).toEqual([""]);
	expect(visibleWidth(renderLine("long text", 4, paint)[0] ?? "")).toBeLessThanOrEqual(4);
});
