import { RunMetricsWidget } from "#src/widget";
import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, test } from "vitest";

const STANDARD_WIDTH = 10;
const SINGLE_LINE = 1;
const FIRST_LINE = 0;
const MULTILINE_WIDTH = 5;

test("right-aligns text using terminal columns and reads fresh values", () => {
	expect.hasAssertions();
	// Arrange
	let text = "↑ 12";
	const widget = new RunMetricsWidget(() => text);

	// Act
	const first = widget.render(STANDARD_WIDTH);
	text = "界 42";
	widget.invalidate();
	const second = widget.render(STANDARD_WIDTH);

	// Assert
	expect(first).toStrictEqual(["      ↑ 12"]);
	expect(second).toStrictEqual(["     界 42"]);
});

test.each([{ width: 0 }, { width: 1 }, { width: 2 }, { width: 3 }, { width: 10 }])(
	"fits a narrow terminal of width $width",
	({ width }) => {
		expect.hasAssertions();
		// Arrange
		const widget = new RunMetricsWidget(() => "12s | 34.2 tok/s | ↑ 1200 ↓ 410 | $0.0042");

		// Act
		const lines = widget.render(width);

		// Assert
		expect(lines).toHaveLength(SINGLE_LINE);
		expect(visibleWidth(lines[FIRST_LINE] ?? "")).toBeLessThanOrEqual(width);
	},
);

test("keeps custom multiline formats on a single widget line", () => {
	expect.hasAssertions();
	// Arrange
	const widget = new RunMetricsWidget(() => "a\nb\rc");

	// Act
	const lines = widget.render(MULTILINE_WIDTH);

	// Assert
	expect(lines).toStrictEqual(["a b c"]);
});
