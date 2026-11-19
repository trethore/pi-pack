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

test("text and return keep real whitespace distinct from literal backslash escapes", async () => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();
	const code = String.raw`text("raw\n\tline"); return [{ file: "first\n\tsecond", literal: "\\t" }];`;

	// Act
	const result = await run(code);

	// Assert
	expect(result.content).toStrictEqual([{
		type: TEXT_TYPE,
		text: "==> 1/2 <==\nraw\n\tline\n==> 2/2 <==\nArray(1)\n0.file:\nfirst\n\tsecond\n0.literal: \\t",
	}]);
});

test("prints leaf paths without adding indentation for each ancestor", async () => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();
	const code = String.raw`text({ output: { details: { stderr: "one\n\ttwo", files: ["a", "b"] } } });`;

	// Act
	const result = await run(code);

	// Assert
	expect(result.content).toStrictEqual([{
		type: TEXT_TYPE,
		text:
			"output.details.stderr:\none\n\ttwo\noutput.details.files: Array(2)\noutput.details.files[0]: a\noutput.details.files[1]: b",
	}]);
});

test("keeps empty containers and distinguishes literal dots from nested paths", async () => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();
	const code = 'text([]); text({}); return { "a.b": {}, a: { b: [] }, "": null };';

	// Act
	const result = await run(code);

	// Assert
	expect(result.content).toStrictEqual([{
		type: TEXT_TYPE,
		text: '==> 1/3 <==\nArray(0)\n==> 2/3 <==\n{}\n==> 3/3 <==\n["a.b"]: {}\na.b: Array(0)\n[""]: null',
	}]);
});

test.each([
	{
		name: "console array values with real line breaks and dotted object fields",
		code: String.raw`console.log(["first\nsecond", { done: true }]);`,
		expected: "Array(2)\n0:\nfirst\nsecond\n1.done: true",
	},
	{
		name: "mixed array entries with leaf paths",
		code: 'return { values: [1, "two", false, null, { nested: "value" }], next: true };',
		expected:
			"values: Array(5)\nvalues[0]: 1\nvalues[1]: two\nvalues[2]: false\nvalues[3]: null\nvalues[4].nested: value\nnext: true",
	},
	{
		name: "nested sparse arrays with their original indices and extra properties",
		code: 'const row = []; row[3] = row; row["a.b"] = 1; return [row, Array(2)];',
		expected: 'Array(2)\n0: Array(4)\n0[3]: [Circular]\n0["a.b"]: 1\n1: Array(2)',
	},
	{
		name: "valid and invalid dates",
		code: 'return { at: new Date("2025-01-02T03:04:05Z"), invalid: new Date(NaN) };',
		expected: "at: 2025-01-02T03:04:05.000Z\ninvalid: Invalid Date",
	},
	{
		name: "map entries in insertion order",
		code: 'text(new Map([["retries", 3], ["mode", "auto"]]));',
		expected: "Map(2)\nretries: 3\nmode: auto",
	},
	{
		name: "escaped map keys and verbatim multiline values",
		code: String.raw`console.log(new Map([["first\nkey", "two\r\nlines"], ["next", { nested: "a\u2028b" }]]));`,
		expected: 'Map(2)\n["first\\nkey"]:\ntwo\r\nlines\nnext.nested: a\u2028b',
	},
	{
		name: "nested collection paths with a non-string map key",
		code: 'return new Map([[{ id: 1 }, new Set([123n, ["two", -0]])]]);',
		expected:
			'Map(1)\n{ "id": 1 }: Set(2)\n{ "id": 1 }[0]: 123n\n{ "id": 1 }[1]: Array(2)\n{ "id": 1 }[1][0]: two\n{ "id": 1 }[1][1]: -0',
	},
	{
		name: "empty and cyclic sets",
		code: "const set = new Set(); set.add(set); return { set, empty: new Set() };",
		expected: "set: Set(1)\nset[0]: [Circular]\nempty: Set(0)",
	},
	{
		name: "opaque built-ins without implying they are empty",
		code: "return { keys: new WeakMap(), members: new WeakSet(), task: Promise.resolve(1) };",
		expected:
			"keys: WeakMap { <entries unknown> }\nmembers: WeakSet { <entries unknown> }\ntask: Promise { <state unknown> }",
	},
	{
		name: "typed arrays, buffers and views",
		code:
			"const bytes = new Uint8Array([1, 2, 3]); return { bytes, buffer: bytes.buffer, view: new DataView(bytes.buffer, 1) };",
		expected:
			"bytes: Uint8Array(3)\nbytes[0]: 1\nbytes[1]: 2\nbytes[2]: 3\nbuffer: ArrayBuffer(3)\nview: DataView { byteLength: 2, byteOffset: 1 }",
	},
	{
		name: "regular expressions and boxed primitives",
		code:
			'return { re: /test/gi, flag: Object(false), count: Object(-0), label: Object("abc"), big: Object(2n), sym: Object(Symbol("id")) };',
		expected:
			're: /test/gi\nflag: Boolean(false)\ncount: Number(-0)\nlabel: String("abc")\nbig: BigInt(2n)\nsym: Symbol(Symbol(id))',
	},
	{
		name: "a cycle back to a containing object",
		code: 'const root = { name: "root" }; root.children = [root]; text(root);',
		expected: "name: root\nchildren: Array(1)\nchildren[0]: [Circular]",
	},
	{
		name: "a map containing itself as a key and value",
		code: "const map = new Map(); map.set(map, map); return map;",
		expected: "Map(1)\n[Circular]: [Circular]",
	},
	{
		name: "a shared object on separate branches",
		code: "const shared = { count: 2 }; return { left: shared, right: shared };",
		expected: "left.count: 2\nright.count: 2",
	},
])("formats $name", async ({ code, expected }) => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();

	// Act
	const result = await run(code);

	// Assert
	expect(result).toMatchObject({ isError: false });
	expect(result.content).toStrictEqual([{ type: TEXT_TYPE, text: expected }]);
});

test.each(["log", "info", "warn", "error", "debug"])(
	"console.%s formats values like text and return",
	async (level) => {
		expect.hasAssertions();
		// Arrange
		const { run } = Harness.create();
		const code = Fixtures.consoleFormatting(level);
		const formatted =
			"at: 1970-01-01T00:00:00.000Z\ncounts: Map(1)\ncounts.ok: Set(1)\ncounts.ok[0]: 2n\nself: [Circular]";

		// Act
		const result = await run(code);

		// Assert
		expect(result.content).toStrictEqual([{
			type: TEXT_TYPE,
			text: `==> 1/3 <==\nresult ${formatted}\n==> 2/3 <==\n${formatted}\n==> 3/3 <==\n${formatted}`,
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
	expect(item?.type === TEXT_TYPE && item.text).toMatch(/failed: Error: oops\n.*reportFailure/u);
});

test("wrapping preserves indentation inside the model's multiline string literal", async () => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();
	const code = "return `start\n  middle\n    end`; // trailing comment";

	// Act
	const result = await run(code);

	// Assert
	expect(result.content).toStrictEqual([{ type: TEXT_TYPE, text: "start\n  middle\n    end" }]);
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
	expect(failed).toMatchObject({ isError: true, content: [{ text: "wrong" }, { text: "stop" }] });
	expect(saved.content).toStrictEqual([{ type: TEXT_TYPE, text: "updated" }]);
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
	expect(deleted.content).toStrictEqual([{ type: TEXT_TYPE, text: "undefined" }]);
	expect(branched.content).toStrictEqual([{ type: TEXT_TYPE, text: "original" }]);
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
	expect(result).toMatchObject({ isError: false, content: [{ text: "abcd\n[output truncated]" }] });
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
	expect(result.content).toStrictEqual([{ type: TEXT_TYPE, text: "source:\na\n\tb" }]);
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
	expect(result.content).toStrictEqual([{ type: TEXT_TYPE, text: "undefined" }]);
});
