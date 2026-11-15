import { Duration } from "#src/duration";
import { expect, test } from "vitest";

test.each([
	{ milliseconds: 0, expected: "0s" },
	{ milliseconds: 999, expected: "0s" },
	{ milliseconds: 9000, expected: "9s" },
	{ milliseconds: 60_000, expected: "1m0s" },
	{ milliseconds: 127_000, expected: "2m7s" },
	{ milliseconds: 3_600_000, expected: "1h0m0s" },
	{ milliseconds: 3_727_999, expected: "1h2m7s" },
	{ milliseconds: 90_000_000, expected: "25h0m0s" },
	{ milliseconds: -1000, expected: "0s" },
])("formats $milliseconds milliseconds as $expected", ({ milliseconds, expected }) => {
	expect.hasAssertions();
	// Arrange: duration and expected text come from the table.

	// Act
	const text = Duration.format(milliseconds);

	// Assert
	expect(text).toBe(expected);
});
