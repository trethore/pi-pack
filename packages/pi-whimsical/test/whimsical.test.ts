import { WhimsicalConfig } from "#src/config";
import { messages } from "#src/messages";
import { Harness, on, setWorkingMessage } from "#test/harness";
import { Events } from "@pi-pack/events";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("#src/config"), () => ({ WhimsicalConfig: { read: vi.fn<typeof WhimsicalConfig.read>() } }));

const FIRST_RANDOM = 0;
const MIDDLE_RANDOM = 0.5;
const LAST_RANDOM = 0.999999;

beforeEach(() => {
	vi.mocked(WhimsicalConfig.read).mockResolvedValue({ enabled: true, messages: [...messages] });
});

afterEach(() => {
	vi.resetAllMocks();
	vi.restoreAllMocks();
});

test("registers one turn_start handler without changing the UI at load time", async () => {
	expect.hasAssertions();
	// Arrange: config is enabled by default.

	// Act
	await Harness.load();

	// Assert
	expect(on).toHaveBeenCalledExactlyOnceWith(Events.TurnStart, expect.any(Function));
	expect(WhimsicalConfig.read).toHaveBeenCalledExactlyOnceWith();
	expect(setWorkingMessage).not.toHaveBeenCalled();
});

test.each([FIRST_RANDOM, MIDDLE_RANDOM, LAST_RANDOM])(
	"selects a built-in message with random value %s",
	async (random) => {
		expect.hasAssertions();
		// Arrange
		vi.spyOn(Math, "random").mockReturnValue(random);
		await Harness.load();

		// Act
		await Harness.turn();

		// Assert
		expect(setWorkingMessage).toHaveBeenCalledExactlyOnceWith(messages[Math.floor(random * messages.length)]);
	},
);

test("selects a fresh custom message on every turn without rereading config", async () => {
	expect.hasAssertions();
	// Arrange
	vi.mocked(WhimsicalConfig.read).mockResolvedValue({ enabled: true, messages: ["First...", "Last..."] });
	vi.spyOn(Math, "random").mockReturnValueOnce(FIRST_RANDOM).mockReturnValueOnce(LAST_RANDOM);
	await Harness.load();

	// Act
	await Harness.turn();
	await Harness.turn();

	// Assert
	expect(setWorkingMessage.mock.calls).toStrictEqual([["First..."], ["Last..."]]);
	expect(WhimsicalConfig.read).toHaveBeenCalledExactlyOnceWith();
});

test("supports a single custom message on every turn", async () => {
	expect.hasAssertions();
	// Arrange
	vi.mocked(WhimsicalConfig.read).mockResolvedValue({ enabled: true, messages: ["Only..."] });
	await Harness.load();

	// Act
	await Harness.turn();
	await Harness.turn();

	// Assert
	expect(setWorkingMessage.mock.calls).toStrictEqual([["Only..."], ["Only..."]]);
});

test("does not register a handler when disabled", async () => {
	expect.hasAssertions();
	// Arrange
	vi.mocked(WhimsicalConfig.read).mockResolvedValue({ enabled: false, messages });

	// Act
	await Harness.load();

	// Assert
	expect(on).not.toHaveBeenCalled();
	expect(setWorkingMessage).not.toHaveBeenCalled();
});

test("does not change the working message without UI support", async () => {
	expect.hasAssertions();
	// Arrange
	const random = vi.spyOn(Math, "random");
	await Harness.load();

	// Act
	await Harness.turn(false);

	// Assert
	expect(setWorkingMessage).not.toHaveBeenCalled();
	expect(random).not.toHaveBeenCalled();
});

test("propagates config errors without registering a handler", async () => {
	expect.hasAssertions();
	// Arrange
	const error = new Error("Invalid whimsical config");
	vi.mocked(WhimsicalConfig.read).mockImplementationOnce(() => {
		throw error;
	});

	// Act
	const { load } = Harness;

	// Assert
	await expect(load()).rejects.toThrow(error);
	expect(on).not.toHaveBeenCalled();
});
