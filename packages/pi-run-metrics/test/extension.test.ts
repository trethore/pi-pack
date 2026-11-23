import { RunMetricsConfig } from "#src/config";
import { Fixtures } from "#test/fixtures";
import { Harness } from "#test/harness";
import { Events } from "@pi-pack/events";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("#src/config"), () => ({ RunMetricsConfig: { read: vi.fn<typeof RunMetricsConfig.read>() } }));

const WIDGET_ID = "pi-run-metrics";
const RESPONSE_MS = 12_000;
const TOOL_MS = 2000;
const IDLE_MS = 10_000;
const NO_TIMERS = 0;
const ONE_TIMER = 1;
const START_AND_RESPONSE_RENDERS = 2;

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(RunMetricsConfig.read).mockResolvedValue({
		enabled: true,
		format: "<timetaken> | <tokps> | ↑ <input_tokens> ↓ <output_tokens> | <cost>",
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.resetAllMocks();
});

test("shows a widget above the prompt on session start", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();

	// Act
	await harness.emit({ type: Events.SessionStart, reason: "startup" });

	// Assert
	expect(harness.setWidget).toHaveBeenCalledExactlyOnceWith(
		WIDGET_ID,
		expect.any(Function),
		{ placement: "aboveEditor" },
	);
	expect(harness.text()).toBe(Fixtures.emptyMetricsText);
});

test("colors widget text with the theme accent", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();
	harness.fg.mockImplementation((_color, text) => `\u001b[36m${text}\u001b[39m`);
	await harness.emit({ type: Events.SessionStart, reason: "startup" });

	// Act
	const text = harness.text();

	// Assert
	expect(harness.fg).toHaveBeenCalledWith("accent", Fixtures.emptyMetricsText);
	expect(text).toBe(`\u001b[36m${Fixtures.emptyMetricsText}\u001b[39m`);
});

test("refreshes elapsed time even before a response ends", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();
	await harness.emit({ type: Events.AgentStart });
	harness.setWidget.mockClear();

	// Act
	vi.advanceTimersByTime(RESPONSE_MS);

	// Assert
	expect(harness.setWidget).toHaveBeenCalledWith(WIDGET_ID, expect.any(Function), { placement: "aboveEditor" });
	expect(harness.text()).toBe("12s | 0.0 tok/s | ↑ 0 ↓ 0 | $0.0000");
});

test("agent_end does not freeze metrics or stop refreshes", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();
	await harness.emit({ type: Events.AgentStart });
	await harness.emit({ type: Events.MessageEnd, message: Fixtures.message() });

	// Act
	await harness.emit({ type: Events.AgentEnd, messages: [] });
	vi.advanceTimersByTime(RESPONSE_MS);

	// Assert
	expect(harness.text()).toBe("12s | 34.2 tok/s | ↑ 1200 ↓ 410 | $0.0042");
	expect(vi.getTimerCount()).toBe(ONE_TIMER);
});

test.each([false, true])("settlement freezes metrics and stops refreshes (aborted=%s)", async (aborted) => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();
	await harness.emit({ type: Events.AgentStart });
	vi.advanceTimersByTime(RESPONSE_MS);
	await harness.emit({ type: Events.MessageEnd, message: Fixtures.message() });

	// Act
	await harness.emit({ type: Events.AgentSettled, aborted });
	harness.setWidget.mockClear();
	vi.advanceTimersByTime(IDLE_MS);

	// Assert
	expect(harness.setWidget).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(NO_TIMERS);
});

test("keeps repeated agent starts in the same run without duplicating timers", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();
	await harness.emit({ type: Events.AgentStart });
	await harness.emit({ type: Events.MessageEnd, message: Fixtures.message() });

	// Act
	vi.advanceTimersByTime(TOOL_MS);
	await harness.emit({ type: Events.AgentStart });
	await harness.emit({ type: Events.MessageEnd, message: Fixtures.message() });

	// Assert
	expect(harness.text()).toBe("2s | 34.2 tok/s | ↑ 2400 ↓ 820 | $0.0084");
	expect(vi.getTimerCount()).toBe(ONE_TIMER);
});

test("ignores non-assistant messages and honors the custom format", async () => {
	expect.hasAssertions();
	// Arrange
	vi.mocked(RunMetricsConfig.read).mockResolvedValue({ enabled: true, format: "<cost> / <output_tokens>" });
	const harness = await Harness.create();
	await harness.emit({ type: Events.AgentStart });

	// Act
	await harness.emit({ type: Events.MessageEnd, message: { role: "user", content: "Hi", timestamp: 0 } });
	await harness.emit({ type: Events.MessageEnd, message: Fixtures.message() });

	// Assert
	expect(harness.setWidget).toHaveBeenCalledTimes(START_AND_RESPONSE_RENDERS);
	expect(harness.text()).toBe("$0.0042 / 410");
});

test("resets metrics and timers on session changes", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();
	await harness.emit({ type: Events.AgentStart });
	await harness.emit({ type: Events.MessageEnd, message: Fixtures.message() });

	// Act
	await harness.emit({ type: Events.SessionStart, reason: "resume" });

	// Assert
	expect(harness.text()).toBe(Fixtures.emptyMetricsText);
	expect(vi.getTimerCount()).toBe(NO_TIMERS);
});

test("removes the widget and clears timers on shutdown", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();
	await harness.emit({ type: Events.AgentStart });

	// Act
	await harness.emit({ type: Events.SessionShutdown, reason: "quit" });

	// Assert
	expect(harness.setWidget).toHaveBeenLastCalledWith(WIDGET_ID, undefined);
	expect(harness.text()).toBeUndefined();
	expect(vi.getTimerCount()).toBe(NO_TIMERS);
});

test("does not register handlers when disabled", async () => {
	expect.hasAssertions();
	// Arrange
	vi.mocked(RunMetricsConfig.read).mockResolvedValue({ enabled: false, format: "<cost>" });

	// Act
	const harness = await Harness.create();

	// Assert
	expect(harness.on).not.toHaveBeenCalled();
	expect(harness.setWidget).not.toHaveBeenCalled();
});

test("does not create widgets or timers in headless sessions", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create(false);

	// Act
	await harness.emit({ type: Events.SessionStart, reason: "startup" });
	await harness.emit({ type: Events.AgentStart });
	await harness.emit({ type: Events.MessageEnd, message: Fixtures.message() });
	await harness.emit({ type: Events.AgentSettled, aborted: false });
	await harness.emit({ type: Events.SessionShutdown, reason: "quit" });

	// Assert
	expect(harness.setWidget).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(NO_TIMERS);
});
