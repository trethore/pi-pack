import { Fixtures } from "#test/fixtures";
import { Harness } from "#test/harness";
import { expect, test } from "vitest";

const TEXT_TYPE = "text";
const toolCall = { type: "toolCall" as const, id: "child", name: "read", arguments: {} };
const RUN_READ = 'return await tools.read({ path: "example" });';

test("only mode moves direct declarations into codemode", () => {
	expect.hasAssertions();
	// Arrange
	const only = Harness.create("only");

	// Act
	const hidden = only.definition.prepareLoadout?.(only.loadout);

	// Assert
	expect(only.definition).toMatchObject({ name: "codemode", exposure: "model-only", defaultActive: false });
	expect(hidden?.hiddenDeclarations).toStrictEqual(["read", "bash"]);
	expect(hidden?.descriptions?.["codemode"]).toContain("read(args:");
	expect(hidden?.descriptions?.["codemode"]).not.toContain("mcp__docs__search");
});

test("on mode leaves direct tool declarations alone", () => {
	expect.hasAssertions();
	// Arrange
	const on = Harness.create();

	// Act
	const direct = on.definition.prepareLoadout?.(on.loadout);

	// Assert
	expect(direct?.hiddenDeclarations).toStrictEqual([]);
	expect(direct?.descriptions?.["codemode"]).not.toContain("read(args:");
});

test.each(["on", "only"] as const)("shows the first-line options example in %s mode", (mode) => {
	expect.hasAssertions();
	// Arrange
	const { definition, loadout } = Harness.create(mode);

	// Act
	const description = definition.prepareLoadout?.(loadout)?.descriptions?.["codemode"];

	// Assert
	expect(description).toMatch(/first line[^\n]*\n\/\/ @options: \{"max_output_tokens": \d+, "timeout_ms": \d+\}/u);
});

test.each(["log", "info", "warn", "error", "debug"])(
	"console.%s formats values like text and return",
	async (level) => {
		expect.hasAssertions();
		// Arrange
		const { run } = Harness.create();
		const code = Fixtures.consoleFormatting(level);
		const formatted = "at: 1970-01-01T00:00:00.000Z\ncounts: Map(1)\n  ok: Set(1)\n    0: 2n\nself: [Circular]";

		// Act
		const result = await run(code);

		// Assert
		expect(result.content).toStrictEqual([{
			type: TEXT_TYPE,
			text: `==> 1/3 <==\n"result" ${formatted}\n==> 2/3 <==\n${formatted}\n==> 3/3 <==\n${formatted}`,
		}]);
	},
);

test("console preserves stack frames on error arguments", async () => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();
	const code = 'function reportFailure() { console.error("failed:", new Error("oops")); } reportFailure();';

	// Act
	const result = await run(code);

	// Assert
	const [item] = result.content;
	expect(item?.type === TEXT_TYPE && item.text).toMatch(/"failed:" Error: oops\n.*reportFailure/u);
});

test("wrapping preserves indentation inside the model's multiline string literal", async () => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();
	const code = "return `start\n  middle\n    end`; // trailing comment";

	// Act
	const result = await run(code);

	// Assert
	expect(result.content).toStrictEqual([{ type: TEXT_TYPE, text: '"""\nstart\n  middle\n    end\n"""' }]);
});

test("failed scripts emit partial output but do not commit writes", async () => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();
	await run('store("version", "updated");');

	// Act
	const failed = await run('store("version", "wrong"); text(load("version")); throw Error("stop");');
	const saved = await run('return load("version");');

	// Assert
	expect(failed).toMatchObject({ isError: true, content: [{ text: '"wrong"' }, { text: "stop" }] });
	expect(saved.content).toStrictEqual([{ type: TEXT_TYPE, text: '"updated"' }]);
});

test("deletion and branch navigation replay Pi's existing store entries", async () => {
	expect.hasAssertions();
	// Arrange
	const { run, sessionManager } = Harness.create();
	const root = sessionManager.appendCustomEntry("codemode-store", { set: { version: "original" }, delete: [] });

	// Act
	await run('store("version", undefined);');
	const deleted = await run('return typeof load("version");');
	sessionManager.branch(root);
	const branched = await run('return load("version");');

	// Assert
	expect(deleted.content).toStrictEqual([{ type: TEXT_TYPE, text: '"undefined"' }]);
	expect(branched.content).toStrictEqual([{ type: TEXT_TYPE, text: '"original"' }]);
});

test("uses the session's checked nested call and propagates a blocked result", async () => {
	expect.hasAssertions();
	// Arrange
	const { run, executeTool } = Harness.create();
	executeTool.mockResolvedValue({
		toolCall,
		isError: true,
		result: { details: {}, content: [{ type: TEXT_TYPE, text: "blocked" }] },
	});

	// Act
	const result = await run(RUN_READ);

	// Assert
	expect(executeTool).toHaveBeenCalledExactlyOnceWith(
		"read",
		{ path: "example" },
		{ signal: expect.any(AbortSignal) as unknown },
	);
	expect(result).toMatchObject({ isError: true, content: [{ text: "" }, { text: "blocked" }] });
});

test("keeps structured results on nonzero exits and limits printed output", async () => {
	expect.hasAssertions();
	// Arrange
	const { run, executeTool } = Harness.create();
	executeTool.mockResolvedValue({
		toolCall,
		isError: true,
		result: { details: {}, content: [], structuredContent: { output: "abcdefgh" } },
	});

	// Act
	const result = await run('// @options: {"max_output_tokens": 1}\nreturn (await tools.bash({})).output;');

	// Assert
	expect(result).toMatchObject({ isError: false, content: [{ text: '"abc\n[output truncated]' }] });
});

test("successful text tools print actual tabs and newlines inside an object", async () => {
	expect.hasAssertions();
	// Arrange
	const { run, executeTool } = Harness.create();
	executeTool.mockResolvedValue({
		toolCall,
		isError: false,
		result: { details: {}, content: [{ type: TEXT_TYPE, text: "a\n\tb" }] },
	});

	// Act
	const result = await run('text({ source: await tools.read({path:"example"}) });');

	// Assert
	expect(result.content).toStrictEqual([{ type: TEXT_TYPE, text: 'source:\n"""\na\n\tb\n"""' }]);
});

test("an aborted call cannot save a value", async () => {
	expect.hasAssertions();
	// Arrange
	const { run, sessionManager } = Harness.create();
	const signal = AbortSignal.abort(new Error("cancelled"));

	// Act
	const result = await run('store("key", "value")', signal);

	// Assert
	expect(result).toMatchObject({ isError: true });
	expect(sessionManager.getBranch()).toStrictEqual([]);
});

test("ignores unrelated and malformed session entries", async () => {
	expect.hasAssertions();
	// Arrange
	const { sessionManager, run } = Harness.create();
	sessionManager.appendCustomEntry("other-extension", { set: { key: "unrelated" }, delete: [] });
	sessionManager.appendCustomEntry("codemode-store", { set: "malformed" });

	// Act
	const result = await run('return typeof load("key");');

	// Assert
	expect(result.content).toStrictEqual([{ type: TEXT_TYPE, text: '"undefined"' }]);
});
