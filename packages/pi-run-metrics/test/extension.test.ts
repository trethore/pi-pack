import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { afterEach, expect, test, vi } from "vitest";
import { createExtensionHarness } from "#test/extension-harness.ts";
import { createWidgetHarness } from "#test/widget-harness.ts";
import { response, delta } from "#metrics-test/fixtures.ts";
import runMetrics from "#metrics/index.ts";
import { loadConfig } from "#metrics/config.ts";

const model: ReturnType<ExtensionContext["modelRegistry"]["find"]> = {
	id: "test",
	name: "Test model",
	provider: "openai",
	api: "openai-completions",
	baseUrl: "https://example.invalid",
	input: ["text"],
	reasoning: false,
	contextWindow: 10000,
	maxTokens: 1000,
	cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
};
const toolEnd = {
	type: Events.ToolExecutionEnd,
	toolCallId: "tool-1",
	toolName: "read",
	result: {},
	isError: false,
} as const;
const settled = { type: Events.AgentSettled, aborted: false } as const;
const initialText = "0s | N/A | ↑ 0 ↓ 0 | $0.0000";

function setup(source = "{}", hasUI = true) {
	const theme: Partial<Theme> = {
		getFgAnsi(color) {
			if (color !== "accent") {
				throw new Error("Unknown theme color");
			}
			return "";
		},
		fg: (_color, text) => text,
	};
	const widget = createWidgetHarness(theme);
	const harness = createExtensionHarness(runMetrics, "pi-run-metrics.jsonc", {
		hasUI,
		ui: { setWidget: widget.setWidget, theme },
		modelRegistry: { find: () => model },
	});
	harness.writeConfig(source);
	return { ...harness, ...widget };
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

test("renders initial values right aligned before the first run", async () => {
	// Arrange
	const { emit, render, setWidget } = setup();
	// Act
	await emit(Events.SessionStart);
	// Assert
	expect(setWidget).toHaveBeenCalledWith("pi-run-metrics", expect.any(Function), { placement: "aboveEditor" });
	expect(render(50)).toEqual([initialText.padStart(50)]);
});

test("timer ticks update elapsed time without publishing pending usage", async () => {
	// Arrange
	vi.useFakeTimers();
	const { emit, render, requestRender } = setup();
	await emit(Events.SessionStart);
	await emit(Events.AgentStart);
	vi.advanceTimersByTime(1000);
	await emit(delta());
	vi.advanceTimersByTime(1000);
	await emit(response());
	requestRender.mockClear();
	// Act
	vi.advanceTimersByTime(1000);
	// Assert
	expect(render()[0]?.trim()).toBe("3s | N/A | ↑ 0 ↓ 0 | $0.0000");
	expect(requestRender).toHaveBeenCalledOnce();
});

test("tool completion refreshes usage without counting the response twice", async () => {
	// Arrange
	vi.useFakeTimers();
	const { emit, render } = setup();
	await emit(Events.SessionStart);
	await emit(Events.AgentStart);
	vi.advanceTimersByTime(1000);
	await emit(delta());
	vi.advanceTimersByTime(2000);
	await emit(response());
	// Act
	await emit(toolEnd);
	const firstToolDisplay = render();
	await emit({ ...toolEnd, toolCallId: "tool-2" });
	// Assert
	expect(firstToolDisplay[0]?.trim()).toBe("3s | 50.0 tok/s | ↑ 200 ↓ 100 | $0.0042");
	expect(render()).toEqual(firstToolDisplay);
});

test.each([false, true])(
	"settlement publishes the final response and freezes the display (aborted: %s)",
	async (aborted) => {
		// Arrange
		vi.useFakeTimers();
		const { emit, render, requestRender } = setup();
		await emit(Events.SessionStart);
		await emit(Events.AgentStart);
		vi.advanceTimersByTime(2000);
		await emit(delta());
		vi.advanceTimersByTime(2000);
		await emit(response());
		// Act
		await emit({ ...settled, aborted });
		const finalDisplay = render();
		requestRender.mockClear();
		vi.advanceTimersByTime(10000);
		// Assert
		expect(finalDisplay[0]?.trim()).toBe("4s | 50.0 tok/s | ↑ 200 ↓ 100 | $0.0042");
		expect(render()).toEqual(finalDisplay);
		expect(requestRender).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	},
);

test("settlement includes the final response after a tool call", async () => {
	// Arrange
	vi.useFakeTimers();
	const { emit, render } = setup();
	await emit(Events.SessionStart);
	await emit(Events.AgentStart);
	await emit(delta());
	vi.advanceTimersByTime(2000);
	await emit(response());
	await emit(toolEnd);
	vi.advanceTimersByTime(10000);
	await emit(delta());
	vi.advanceTimersByTime(4000);
	await emit(response(200));
	// Act
	await emit(settled);
	// Assert
	expect(render()[0]?.trim()).toBe("16s | 50.0 tok/s | ↑ 400 ↓ 300 | $0.0084");
});

test("a new run resets the completed values", async () => {
	// Arrange
	vi.useFakeTimers();
	const { emit, render } = setup();
	await emit(Events.SessionStart);
	await emit(Events.AgentStart);
	await emit(delta());
	vi.advanceTimersByTime(2000);
	await emit(response());
	await emit(settled);
	// Act
	await emit(Events.AgentStart);
	// Assert
	expect(render()[0]?.trim()).toBe(initialText);
	expect(vi.getTimerCount()).toBe(1);
});

test("shutdown removes the widget and stops refreshes", async () => {
	// Arrange
	vi.useFakeTimers();
	const { emit, setWidget, requestRender } = setup();
	await emit(Events.SessionStart);
	await emit(Events.AgentStart);
	requestRender.mockClear();
	// Act
	await emit(Events.SessionShutdown);
	vi.advanceTimersByTime(5000);
	// Assert
	expect(vi.getTimerCount()).toBe(0);
	expect(setWidget).toHaveBeenLastCalledWith("pi-run-metrics", undefined);
	expect(requestRender).not.toHaveBeenCalled();
});

test.each(['{"enabled":false}', '{"widgetColor":"invalid"}', '{"enabled":"yes"}', "{"])(
	"does not activate with config %s",
	async (source) => {
		// Arrange
		vi.useFakeTimers();
		const { emit, setWidget, notify } = setup(source);
		// Act
		await emit(Events.SessionStart);
		await emit(Events.AgentStart);
		// Assert
		expect(setWidget).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		expect(notify).toHaveBeenCalledTimes(source.includes("false") ? 0 : 1);
	},
);

test("does not install UI or timers in headless mode", async () => {
	// Arrange
	vi.useFakeTimers();
	const { emit, setWidget } = setup("{}", false);
	// Act
	await emit(Events.SessionStart);
	await emit(Events.AgentStart);
	// Assert
	expect(setWidget).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

test("reads JSONC from the overridden global directory", () => {
	// Arrange
	setup('{ // settings\n "widgetColor": "#AABBCC", "format": "<cost>", }');
	// Act
	const config = loadConfig();
	// Assert
	expect(config).toEqual({ enabled: true, widgetColor: "#AABBCC", format: "<cost>" });
});

test("invalid config reload cleans up the active run and a later reload recovers", async () => {
	// Arrange
	vi.useFakeTimers();
	const { emit, writeConfig, setWidget, notify, render } = setup();
	await emit(Events.SessionStart);
	await emit(Events.AgentStart);
	writeConfig('{"enabled":"yes"}');
	// Act
	await emit(Events.SessionStart);
	await emit(Events.AgentStart);
	const timersAfterFailure = vi.getTimerCount();
	const lastWidgetCallAfterFailure = setWidget.mock.lastCall;
	writeConfig('{"format":"Cost: <cost>", "widgetColor":"#AABBCC"}');
	await emit(Events.SessionStart);
	// Assert
	expect(timersAfterFailure).toBe(0);
	expect(lastWidgetCallAfterFailure).toEqual(["pi-run-metrics", undefined]);
	expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Extension inactive"), "error");
	expect(render(13)).toEqual(["\x1b[38;2;170;187;204mCost: $0.0000\x1b[39m"]);
});
