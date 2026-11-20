import { Harness } from "#test/harness";
import { highlightCode, initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { ProcessTerminal, stripTerminalSequences, TuiMainScreen } from "@earendil-works/pi-tui";
import { afterEach, expect, test, vi } from "vitest";

const RETURN_STATEMENT = "return 42;";
const WRAPPED_LINES = 6;

afterEach(() => {
	vi.useRealTimers();
});

test.each([false, true])("renders the full script below the title (expanded: %s)", (expanded) => {
	expect.hasAssertions();
	// Arrange
	initTheme("dark");
	const { definition } = Harness.create();
	const chunk = "//xxxxxxxxxxxxxxxxxx";
	const code = [chunk.repeat(WRAPPED_LINES), "", RETURN_STATEMENT].join("\n");
	const ui = new TuiMainScreen(new ProcessTerminal());
	const call = new ToolExecutionComponent("codemode", "call", { code }, { outputPad: 0 }, definition, ui, ".");

	// Act
	call.setExpanded(expanded);
	const lines = call.render(chunk.length).map((line) => stripTerminalSequences(line).trimEnd());

	// Assert
	expect(lines.join("\n").trim()).toBe(
		["codemode", ...Array<string>(WRAPPED_LINES).fill(chunk), "", RETURN_STATEMENT].join("\n"),
	);
});

test("renders only the title when no code has arrived", () => {
	expect.hasAssertions();
	// Arrange
	initTheme("dark");
	const { definition } = Harness.create();
	const ui = new TuiMainScreen(new ProcessTerminal());
	const call = new ToolExecutionComponent("codemode", "call", {}, { outputPad: 0 }, definition, ui, ".");

	// Act
	const lines = call.render("codemode".length).map((line) => stripTerminalSequences(line).trimEnd());

	// Assert
	expect(lines.join("\n").trim()).toBe("codemode");
});

test("renders JavaScript with Pi's syntax colors", () => {
	expect.hasAssertions();
	// Arrange
	initTheme("dark");
	const { definition } = Harness.create();
	const ui = new TuiMainScreen(new ProcessTerminal());
	const call = new ToolExecutionComponent(
		"codemode",
		"call",
		{ code: RETURN_STATEMENT },
		{ outputPad: 0 },
		definition,
		ui,
		".",
	);

	// Act
	const lines = call.render(RETURN_STATEMENT.length);

	// Assert
	expect(lines.join("\n")).toContain(highlightCode(RETURN_STATEMENT, "javascript").join("\n"));
});

const WIDTH = 80;
const QUEUED_MS = 5000;
const RUN_MS = 90_000;
const FINAL_MS = 90_123;

function timedCall() {
	initTheme("dark");
	const { definition } = Harness.create();
	const ui = new TuiMainScreen(new ProcessTerminal());
	const call = new ToolExecutionComponent(
		"codemode",
		"call",
		{ code: RETURN_STATEMENT },
		{ outputPad: 0 },
		definition,
		ui,
		".",
	);
	function display(): string {
		return call.render(WIDTH).map((line) => stripTerminalSequences(line).trimEnd()).join("\n").trim();
	}
	const redraw = vi.spyOn(ui, "requestRender").mockImplementation(() => {
		display();
	});
	return { call, display, redraw };
}

test("starts timing only when execution begins and refreshes without tool output", () => {
	expect.hasAssertions();
	// Arrange
	vi.useFakeTimers();
	const { call, display } = timedCall();
	vi.advanceTimersByTime(QUEUED_MS);

	// Act
	call.markExecutionStarted();
	const started = display();
	vi.advanceTimersByTime(RUN_MS);

	// Assert
	expect(started).toBe(`codemode\n${RETURN_STATEMENT} 0.0s`);
	expect(display()).toBe(`codemode\n${RETURN_STATEMENT} 90.0s`);
});

test.each([false, true])("freezes at the recorded duration on a final result (error: %s)", (isError) => {
	expect.hasAssertions();
	// Arrange
	vi.useFakeTimers();
	const { call, display, redraw } = timedCall();
	call.markExecutionStarted();

	// Act
	call.updateResult({ content: [], isError, durationMs: FINAL_MS });
	redraw.mockClear();
	vi.advanceTimersByTime(QUEUED_MS);

	// Assert
	expect(display()).toBe(`codemode\n${RETURN_STATEMENT} 90.1s`);
	expect(redraw).not.toHaveBeenCalled();
});
