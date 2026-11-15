import { RunMetricsWidget } from "#src/widget";
import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, test } from "vitest";

const standardWidth = 10;
const singleLine = 1;
const firstLine = 0;
const multilineWidth = 5;

test("right-aligns text using terminal columns and reads fresh values", () => {
	expect.hasAssertions();
	// Arrange
	let text = "↑ 12";
	const widget = new RunMetricsWidget(() => text);

	// Act
	const first = widget.render(standardWidth);
	text = "界 42";
	widget.invalidate();
	const second = widget.render(standardWidth);

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
		expect(lines).toHaveLength(singleLine);
		expect(visibleWidth(lines[firstLine] ?? "")).toBeLessThanOrEqual(width);
	},
);

test("keeps custom multiline formats on a single widget line", () => {
	expect.hasAssertions();
	// Arrange
	const widget = new RunMetricsWidget(() => "a\nb\rc");

	// Act
	const lines = widget.render(multilineWidth);

	// Assert
	expect(lines).toStrictEqual(["a b c"]);
});
