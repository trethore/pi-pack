import type { ExtensionEvent } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { expect, expectTypeOf, test } from "vitest";

test("provides unique event names with literal types for every Pi event", () => {
	// Arrange
	const values = Object.values(Events);

	// Act
	const uniqueValues = new Set(values);

	// Assert
	expect(uniqueValues.size).toBe(values.length);
	expect(Events.TurnStart).toBe("turn_start");
	expect(Events.SessionShutdown).toBe("session_shutdown");
	expectTypeOf(Events.TurnStart).toEqualTypeOf<"turn_start">();
	expectTypeOf<(typeof Events)[keyof typeof Events]>().toEqualTypeOf<ExtensionEvent["type"]>();
});
