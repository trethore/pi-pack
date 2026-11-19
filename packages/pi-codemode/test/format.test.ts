import { Harness } from "#test/harness";
import dedent from "dedent";
import { expect, test } from "vitest";

test.each([
	{
		name: "String versus boolean",
		code: 'text(["true", true, "false", false, "", "  padded  "])',
		expected: dedent`
			Array(6)
			0: "true"
			1: true
			2: "false"
			3: false
			4: ""
			5: "  padded  "
		`,
	},
	{ name: "Quotes are content", code: "text('say \"hi\"')", expected: '"say "hi""' },
	{
		name: "A real tab versus a literal backslash and t",
		code: String.raw`text(["a\tb", "a\\tb"])`,
		expected: 'Array(2)\n0: "a\tb"\n1: "a\\tb"',
	},
	{
		name: "Standalone multiline string with a trailing newline",
		code: String.raw`text("first\nsecond\n")`,
		expected: '"""\nfirst\nsecond\n\n"""',
	},
	{
		name: "Fence collision",
		code: String.raw`text('start\n"""\n""""\nend')`,
		expected: dedent`
			"""""
			start
			"""
			""""
			end
			"""""
		`,
	},
	{
		name: "Ordinary and special numbers",
		code: "text([0, -0, 12.5, NaN, Infinity, -Infinity])",
		expected: dedent`
			Array(6)
			0: 0
			1: -0
			2: 12.5
			3: NaN
			4: Infinity
			5: -Infinity
		`,
	},
	{
		name: "Bigints versus numbers",
		code: "text([42, 42n, -9007199254740993n])",
		expected: dedent`
			Array(3)
			0: 42
			1: 42n
			2: -9007199254740993n
		`,
	},
	{
		name: "Null, undefined and symbols",
		code: 'text({ missing: undefined, empty: null, token: Symbol("id") })',
		expected: dedent`
			missing: undefined
			empty: null
			token: Symbol(id)
		`,
	},
	{
		name: "Empty containers",
		code: "text({ object: {}, array: [], map: new Map(), set: new Set() })",
		expected: dedent`
			object: {}
			array: Array(0)
			map: Map(0)
			set: Set(0)
		`,
	},
	{
		name: "Nested arrays and objects",
		code: 'text([{ files: ["a.js", "b.js"] }, [false]])',
		expected: dedent`
			Array(2)
			0.files: Array(2)
			  0: "a.js"
			  1: "b.js"
			1: Array(1)
			  0: false
		`,
	},
	{
		name: "Sparse array with an extra property",
		code: dedent`
			const row = Array(4);
			row[2] = undefined;
			row.note = "ok";
			text(row)
		`,
		expected: dedent`
			Array(4)
			2: undefined
			note: "ok"
		`,
	},
	{
		name: "Literal dots, empty keys and symbol keys",
		code: 'text({ "a.b": 1, a: { b: 2 }, "": 3, [Symbol("id")]: 4 })',
		expected: dedent`
			["a.b"]: 1
			a.b: 2
			[""]: 3
			[Symbol(id)#1]: 4
		`,
	},
	{
		name: "Null-prototype object with a getter",
		code: dedent`
			const obj = Object.assign(Object.create(null), { ok: true });
			Object.defineProperty(obj, "value", { enumerable: true, get() { throw Error("not called"); } });
			text(obj)
		`,
		expected: "ok: true\nvalue: [Getter]",
	},
	{
		name: "Map with string keys and multiline text",
		code: String.raw`text(new Map([["key1", "lineone\nlinetwo"], ["key2", 123]]))`,
		expected: dedent`
			Map(2)
			key1:
			"""
			lineone
			linetwo
			"""
			key2: 123
		`,
	},
	{
		name: "Map key types stay distinct",
		code: 'text(new Map([[1, "number"], ["1", "string"], [1n, "bigint"], [false, "boolean"]]))',
		expected: dedent`
			Map(4)
			[1]: "number"
			["1"]: "string"
			[1n]: "bigint"
			[false]: "boolean"
		`,
	},
	{
		name: "Object map keys use identity, not contents",
		code:
			'const a = { id: 1 }, b = { id: 1 };\ntext({ first: new Map([[a, "A"], [b, "B"]]), again: new Map([[a, "same key"]]) })',
		expected: dedent`
			first: Map(2)
			  Object#1: "A"
			  Object#2: "B"
			again: Map(1)
			  Object#1: "same key"
		`,
	},
	{
		name: "Same-description symbol keys keep their identity across maps and fields",
		code: dedent`
			const first = Symbol("tag");
			const second = Symbol("tag");
			text({ map: new Map([[first, 1], [second, 2]]), fields: { [second]: 3, [first]: 4 } });
		`,
		expected: dedent`
			map: Map(2)
			  [Symbol(tag)#1]: 1
			  [Symbol(tag)#2]: 2
			fields[Symbol(tag)#2]: 3
			fields[Symbol(tag)#1]: 4
		`,
	},
	{
		name: "Set in insertion order",
		code: 'text(new Set(["z", "a", "z", 3n]))',
		expected: dedent`
			Set(3)
			0: "z"
			1: "a"
			2: 3n
		`,
	},
	{
		name: "Cycle versus a shared sibling",
		code: dedent`
			const shared = { n: 1 };
			const root = { left: shared, right: shared };
			root.self = root;
			text(root)
		`,
		expected: dedent`
			left.n: 1
			right.n: 1
			self: [Circular]
		`,
	},
	{
		name: "Weak collections, even when populated",
		code: "const key = {};\ntext({ map: new WeakMap([[key, 1]]), set: new WeakSet([key]) })",
		expected: "map: WeakMap { <entries unknown> }\nset: WeakSet { <entries unknown> }",
	},
	{
		name: "Promise state is not inspected",
		code: 'text(Promise.resolve("done"))',
		expected: "Promise { <state unknown> }",
	},
	{
		name: "Typed arrays",
		code: "text({ bytes: new Uint8Array([0, 255]), big: new BigInt64Array([-2n]) })",
		expected: dedent`
			bytes: Uint8Array(2)
			  0: 0
			  1: 255
			big: BigInt64Array(1)
			  0: -2n
		`,
	},
	{
		name: "Buffer and a view into it",
		code: "const buffer = new ArrayBuffer(8);\ntext({ buffer, slice: new DataView(buffer, 2, 4) })",
		expected: "buffer: ArrayBuffer(8)\nslice: DataView { byteLength: 4, byteOffset: 2 }",
	},
	{
		name: "Dates, regexp and error values",
		code: 'text({ epoch: new Date(0), bad: new Date(NaN), re: /hello/gi, err: new TypeError("bad input") })',
		expected: dedent`
			epoch: 1970-01-01T00:00:00.000Z
			bad: Invalid Date
			re: /hello/gi
			err: TypeError: bad input
		`,
	},
	{
		name: "Boxed primitives",
		code: 'text([Object(false), Object(-0), Object("abc"), Object(2n), Object(Symbol("id"))])',
		expected: dedent`
			Array(5)
			0: Boolean(false)
			1: Number(-0)
			2: String("abc")
			3: BigInt(2n)
			4: Symbol(Symbol(id))
		`,
	},
	{
		name: "Functions and classes",
		code: "text([function run() {}, async function load() {}, function* rows() {}, class User {}])",
		expected: dedent`
			Array(4)
			0: [Function: run]
			1: [AsyncFunction: load]
			2: [GeneratorFunction: rows]
			3: [Class: User]
		`,
	},
	{
		name: "Iterators are not consumed",
		code: "text({ values: [1, 2].values(), rows: (function* () { yield 1; })() })",
		expected: "values: [Array Iterator]\nrows: [Generator]",
	},
	{
		name: "An unreadable value does not hide its siblings",
		code: dedent`
			const { proxy, revoke } = Proxy.revocable({}, {});
			revoke();
			text({ unreadable: proxy, next: 1 })
		`,
		expected: "unreadable: [Uninspectable]\nnext: 1",
	},
	{
		name: "preserves each ECMAScript line terminator",
		code: String.raw`text(["a\rb", "a\r\nb", "a\u2028b", "a\u2029b"])`,
		expected: 'Array(4)\n0:\n"""\na\rb\n"""\n1:\n"""\na\r\nb\n"""\n2:\n"""\na\u2028b\n"""\n3:\n"""\na\u2029b\n"""',
	},
	{
		name: "nested fences indent only their delimiters",
		code: String.raw`text({ items: new Set(["a\n  b"]) })`,
		expected: dedent`
			items: Set(1)
			  0:
			  """
			a
			  b
			  """
		`,
	},
	{
		name: "map containing itself as key and value",
		code: "const m = new Map(); m.set(m, m); text(m)",
		expected: "Map(1)\nMap#1: [Circular]",
	},
	{
		name: "detached buffer",
		code: "const b = new ArrayBuffer(4); b.transfer(); text(b)",
		expected: "ArrayBuffer { <detached> }",
	},
	{
		name: "other available QuickJS built-ins",
		code:
			"const key = {}; text([new WeakRef(key), new FinalizationRegistry(() => {}), Math, new SharedArrayBuffer(2), new DisposableStack()])",
		expected: dedent`
			Array(5)
			0: WeakRef { <state unknown> }
			1: FinalizationRegistry { <entries unknown> }
			2: [Math]
			3: SharedArrayBuffer(2)
			4: [DisposableStack]
		`,
	},
	{
		name: "map labels escape line breaks without escaping the value",
		code: String.raw`text(new Map([["a\nb", "c\nd"]]))`,
		expected: 'Map(1)\n["a\\nb"]:\n"""\nc\nd\n"""',
	},
	{
		name: "a revoked map key does not hide the other entries",
		code: 'const { proxy, revoke } = Proxy.revocable({}, {}); revoke(); text(new Map([[proxy, 1], ["ok", 2]]))',
		expected: "Map(2)\nObject#1: 1\nok: 2",
	},
	{
		name: "getter used as a type tag is not invoked",
		code: 'text({ get [Symbol.toStringTag]() { throw Error("not called"); } })',
		expected: "[Symbol(Symbol.toStringTag)#1]: [Getter]",
	},
	{
		name: "collection headers and typed array contents ignore shadowing accessors",
		code: dedent`
            const bytes = new Uint8Array([7]);
            const map = new Map([["bytes", bytes]]);
            const set = new Set([map]);
            const trap = { get() { throw Error("not called"); } };
            Object.defineProperty(map, "size", trap);
            Object.defineProperty(set, "size", trap);
            Object.defineProperty(bytes, "length", trap);
            Object.defineProperty(bytes, Symbol.iterator, trap);
            text(set);
        `,
		expected: "Set(1)\n0: Map(1)\n  bytes: Uint8Array(1)\n    0: 7",
	},
	{
		name: "object key type tags cannot split a label across lines",
		code: String
			.raw`const key = Object.defineProperty({}, Symbol.toStringTag, { value: "a\nb" }); text(new Map([[key, 1]]));`,
		expected: "Map(1)\na\\nb#1: 1",
	},
])("formats $name", async ({ code, expected }) => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();

	// Act
	const result = await run(code);

	// Assert
	expect(result).toMatchObject({ isError: false });
	expect(result.content).toStrictEqual([{ type: "text", text: expected }]);
});
