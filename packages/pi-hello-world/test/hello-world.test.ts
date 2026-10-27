import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import helloWorld from "#hello-world/index.ts";

test("notifies hello world when a session starts", async () => {
	// Arrange
	const on =
		vi.fn<
			(
				event: "session_start",
				handler: (event: SessionStartEvent, ctx: ExtensionContext) => void | Promise<void>,
			) => void
		>();
	// Only the API surface used by this extension is mocked.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const pi = { on } as unknown as ExtensionAPI;
	const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
	// The handler only needs the notification UI method.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const context = { ui: { notify } } as unknown as ExtensionContext;

	// Act
	helloWorld(pi);
	const registration = on.mock.calls[0];
	if (!registration) {
		throw new Error("Expected a session_start handler to be registered.");
	}
	const handler = registration[1];
	await handler({ type: "session_start", reason: "startup" }, context);

	// Assert
	expect(on).toHaveBeenCalledExactlyOnceWith("session_start", expect.any(Function));
	expect(notify).toHaveBeenCalledExactlyOnceWith("hello world", "info");
});
