import { type EnumMember, type EnumValue } from "@a-box-of-scraps/ts-utils";
import { type ExtensionEvent } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { describe, expect, expectTypeOf, it } from "vitest";

type EventIdentity = EnumValue<typeof Events> extends EnumMember<string, infer Identity> ? Identity : never;

describe("extension event constants", () => {
	it("covers all Pi event types without duplicate values", () => {
		expect.hasAssertions();
		// Checked by tsc: reject both missing Pi events and extra values.
		expectTypeOf<EnumValue<typeof Events>>().toEqualTypeOf<EnumMember<ExtensionEvent["type"], EventIdentity>>();
		const values = Object.values(Events);
		expect(new Set(values).size).toBe(values.length);
	});

	it.each(Object.entries(Events))("maps %s to its snake_case event name", (key, value) => {
		expect.hasAssertions();
		const eventName = key.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, "");
		expect(value).toBe(eventName);
	});
});
