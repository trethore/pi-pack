import { OpenAISettingsConfig } from "#src/config";
import { Fixtures } from "#test/fixtures";
import { Harness } from "#test/harness";
import { Events } from "@pi-pack/events";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("#src/config"), async (importOriginal) => {
	const original = await importOriginal();
	return {
		...original,
		OpenAISettingsConfig: {
			...original.OpenAISettingsConfig,
			read: vi.fn<typeof OpenAISettingsConfig.read>(),
			save: vi.fn<typeof OpenAISettingsConfig.save>(),
		},
	};
});

beforeEach(() => {
	vi.mocked(OpenAISettingsConfig.read).mockReturnValue(OpenAISettingsConfig.defaults());
});

afterEach(() => {
	vi.resetAllMocks();
});

test("registers the request hook and command even when initially disabled", async () => {
	expect.hasAssertions();
	// Arrange
	const config = { ...OpenAISettingsConfig.defaults(), enabled: false };
	vi.mocked(OpenAISettingsConfig.read).mockReturnValue(config);

	// Act
	const harness = Harness.create();
	const result = await harness.request({});
	await harness.command("enabled true");

	// Assert
	expect(harness.on).toHaveBeenCalledExactlyOnceWith(Events.BeforeProviderRequest, expect.any(Function));
	expect(harness.registerCommand).toHaveBeenCalledExactlyOnceWith(
		"openai-settings",
		expect.any(Object),
	);
	expect(result).toBeUndefined();
	await expect(harness.request({})).resolves.toStrictEqual({});
});

test.each([
	Fixtures.model,
	{ provider: "azure", api: "azure-openai-responses" },
	{ provider: "github-copilot", api: "openai-responses" },
])("applies command changes to subsequent requests for $provider", async (model) => {
	expect.hasAssertions();
	// Arrange
	const config = OpenAISettingsConfig.defaults();
	config.verbosity.command = true;
	vi.mocked(OpenAISettingsConfig.read).mockReturnValue(config);
	const harness = Harness.create();

	// Act
	await harness.command("verbosity high");
	const result = await harness.request({ model: "test", text: { format: { type: "text" } } }, model);
	await harness.command("verbosity null");

	// Assert
	expect(result).toStrictEqual({ model: "test", text: { format: { type: "text" }, verbosity: "high" } });
	await expect(harness.request({}, model)).resolves.toStrictEqual({});
});

test("uses the current model on every request", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = Harness.create();

	// Act
	const supported = await harness.request({});
	const unsupported = await harness.request({}, { provider: "openai", api: "openai-completions" });

	// Assert
	expect(supported).toStrictEqual({});
	expect(unsupported).toBeUndefined();
});

test("reports command errors without throwing or modifying settings", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = Harness.create();

	// Act
	await harness.command("webSearch true");

	// Assert
	expect(harness.notify).toHaveBeenCalledExactlyOnceWith(
		"Error: The webSearch command is disabled in the global config.",
		"error",
	);
	await expect(harness.request({})).resolves.toStrictEqual({});
});

test("shows settings with no arguments", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = Harness.create();

	// Act
	await harness.command("");

	// Assert
	expect(harness.notify).toHaveBeenCalledWith(expect.stringContaining("enabled = true"), "info");
});
