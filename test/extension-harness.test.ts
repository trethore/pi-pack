import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { afterEach, expect, test, vi } from "vitest";
import { createExtensionHarness } from "#test/extension-harness";

afterEach(() => vi.unstubAllEnvs());

test("dispatches to every subscriber in registration order and awaits async handlers", async () => {
	// Arrange
	const calls: string[] = [];
	const { emit } = createExtensionHarness((pi) => {
		pi.on(Events.AgentSettled, async (event) => {
			await Promise.resolve();
			calls.push(event.aborted ? "aborted" : "settled");
		});
		pi.on(Events.AgentSettled, () => {
			calls.push("second");
		});
	}, "test.jsonc");
	// Act
	await emit({ type: Events.AgentSettled, aborted: true });
	// Assert
	expect(calls).toEqual(["aborted", "second"]);
});

test("fails explicitly when an event has no subscribers", async () => {
	// Arrange
	const { emit } = createExtensionHarness(() => {}, "test.jsonc");
	// Act / Assert
	await expect(emit(Events.AgentStart)).rejects.toThrow("Missing handler: agent_start");
});

test("isolates global config files between harness instances", () => {
	// Arrange
	const first = createExtensionHarness(() => {}, "test.jsonc");
	const firstDirectory = getAgentDir();
	first.writeConfig('{"enabled":true}');
	const second = createExtensionHarness(() => {}, "test.jsonc");
	const secondDirectory = getAgentDir();
	// Act
	second.writeConfig('{"enabled":false}');
	// Assert
	expect(secondDirectory).not.toBe(firstDirectory);
	expect(readFileSync(join(firstDirectory, "test.jsonc"), "utf8")).toBe('{"enabled":true}');
	expect(readFileSync(join(secondDirectory, "test.jsonc"), "utf8")).toBe('{"enabled":false}');
});

test("makes initial config available during extension registration", () => {
	// Arrange
	let source: string | undefined;
	// Act
	createExtensionHarness(
		() => {
			source = readFileSync(join(getAgentDir(), "test.jsonc"), "utf8");
		},
		"test.jsonc",
		{},
		'{"enabled":true}',
	);
	// Assert
	expect(source).toBe('{"enabled":true}');
});

test("registers and awaits commands with the configured context", async () => {
	// Arrange
	const { commands, runCommand, notify } = createExtensionHarness((pi) => {
		pi.registerCommand("test", {
			async handler(args, ctx) {
				await Promise.resolve();
				ctx.ui.notify(args, "info");
			},
		});
	}, "test.jsonc");
	// Act
	await runCommand("test", "hello");
	// Assert
	expect(commands.has("test")).toBe(true);
	expect(notify).toHaveBeenCalledExactlyOnceWith("hello", "info");
	await expect(runCommand("missing", "")).rejects.toThrow("Missing command: missing");
});
