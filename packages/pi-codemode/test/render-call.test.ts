import { Harness } from "#test/harness";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { ProcessTerminal, stripTerminalSequences, TuiMainScreen } from "@earendil-works/pi-tui";
import { expect, test } from "vitest";

const wrappedLines = 6;

test.each([false, true])("renders the full script below the title (expanded: %s)", (expanded) => {
	expect.hasAssertions();
	// Arrange
	initTheme("dark");
	const { definition } = Harness.create();
	const chunk = "//xxxxxxxxxxxxxxxxxx";
	const code = [chunk.repeat(wrappedLines), "", "return 42;"].join("\n");
	const ui = new TuiMainScreen(new ProcessTerminal());
	const call = new ToolExecutionComponent("codemode", "call", { code }, { outputPad: 0 }, definition, ui, ".");

	// Act
	call.setExpanded(expanded);
	const lines = call.render(chunk.length).map((line) => stripTerminalSequences(line).trimEnd());

	// Assert
	expect(lines.join("\n").trim()).toBe(
		["codemode", ...Array<string>(wrappedLines).fill(chunk), "", "return 42;"].join("\n"),
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
