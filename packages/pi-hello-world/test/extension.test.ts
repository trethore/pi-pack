import helloWorld from "#src/index";
import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { expect, test, vi } from "vitest";

test("notifies on session start", () => {
	expect.hasAssertions();
	const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
	const context = { ui: { notify } };
	const on = vi.fn<ExtensionAPI["on"]>();
	Reflect.apply(helloWorld, undefined, [{ on }]);
	expect(on).toHaveBeenCalledExactlyOnceWith(Events.SessionStart, expect.any(Function));
	for (const [, handler] of on.mock.calls) {
		Reflect.apply(handler, undefined, [{ type: Events.SessionStart }, context]);
	}
	expect(notify).toHaveBeenCalledExactlyOnceWith("Hello, world!", "info");
});
