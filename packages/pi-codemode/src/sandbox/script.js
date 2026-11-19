// Evaluated inside QuickJS, alongside the text and console wrappers.
/** @typedef {{ label: string, value: unknown } | { label: string, literal: string }} Entry */
/** @typedef {{ header?: string, entries: Iterable<Entry> }} Group */

const LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/u;
const INDENT = "  ";
const FIRST_FENCE = '"""';
const UNINSPECTABLE = "[Uninspectable]";
const OBJECT_TYPE = "Object";
const NEGATIVE_ZERO = -0;
const FIRST_ID = 1;

/** @param {string} value @param {string} path @param {string} indent */
function stringLiteral(value, path = "", indent = "") {
	if (!LINE_BREAK.test(value)) {
		return `${prefix(path, indent)}"${value}"`;
	}
	const fence = blockFence(value, indent);
	const block = `${indent}${fence}\n${value}\n${indent}${fence}`;
	if (path === "") {
		return block;
	}
	return `${indent}${path}:\n${block}`;
}

/** @param {string} value @param {string} indent */
function blockFence(value, indent) {
	const lines = new Set(value.split(LINE_BREAK));
	let fence = FIRST_FENCE;
	function collides() {
		return lines.has(fence) || lines.has(indent + fence);
	}
	while (collides()) {
		fence += '"';
	}
	return fence;
}

/** @param {unknown} value */
function scalar(value) {
	if (typeof value === "bigint") {
		return `${value}n`;
	}
	if (Object.is(value, NEGATIVE_ZERO)) {
		return "-0";
	}
	return String(value);
}

/** @param {unknown} value @returns {value is object} */
function isReference(value) {
	return value !== null && (typeof value === "object" || typeof value === "function");
}

/** @param {string | symbol} key */
function fieldLabel(key) {
	if (typeof key === "symbol") {
		return `[${labelText(String(key))}]`;
	}
	if (/^[A-Za-z_$][\w$]*$/u.test(key)) {
		return key;
	}
	return `[${singleLine(JSON.stringify(key))}]`;
}

/** @param {string} label */
function labelText(label) {
	return singleLine(JSON.stringify(label).replace(/^"|"$/gu, ""));
}

/** @param {string} label */
function singleLine(label) {
	return label.replaceAll("\u2028", String.raw`\u2028`).replaceAll("\u2029", String.raw`\u2029`);
}

/** @param {object} value @param {string | symbol} key */
function propertyLabel(value, key) {
	const arrayIndex = Array.isArray(value) && typeof key === "string" && /^(?:0|[1-9]\d*)$/u.test(key)
		&& Number(key) < value.length;
	if (arrayIndex) {
		return key;
	}
	return fieldLabel(key);
}

/** @param {object} value @returns {Generator<Entry>} */
function* fields(value) {
	for (const key of Reflect.ownKeys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor?.enumerable === true) {
			const label = propertyLabel(value, key);
			yield fieldEntry(label, descriptor);
		}
	}
}

/** @param {string} label @param {PropertyDescriptor} descriptor @returns {Entry} */
function fieldEntry(label, descriptor) {
	if ("value" in descriptor) {
		return { label, value: /** @type {unknown} */ (descriptor.value) };
	}
	if (descriptor.get === undefined) {
		return { label, literal: "[Setter]" };
	}
	if (descriptor.set === undefined) {
		return { label, literal: "[Getter]" };
	}
	return { label, literal: "[Getter/Setter]" };
}

/** @param {Iterable<unknown>} values @returns {Generator<Entry>} */
function* indexed(values) {
	let index = 0;
	for (const value of values) {
		yield { label: String(index++), value };
	}
}

/** @param {object} value */
function typeName(value) {
	// Use data tags directly; never invoke a user-defined toStringTag getter.
	for (let owner = /** @type {unknown} */ (value); isReference(owner); owner = Reflect.getPrototypeOf(owner)) {
		const tag = Object.getOwnPropertyDescriptor(owner, Symbol.toStringTag);
		if (tag !== undefined) {
			if (owner === Object.getPrototypeOf(Uint8Array.prototype)) {
				break;
			}
			return dataTag(tag);
		}
	}
	return Object.prototype.toString.call(value).replace(/^\[object |\]$/gu, "");
}

/** @param {PropertyDescriptor} tag */
function dataTag(tag) {
	const name = /** @type {unknown} */ (tag.value);
	const named = tag.enumerable !== true && typeof name === "string";
	if (named) {
		return name;
	}
	return OBJECT_TYPE;
}

/** @param {Function} value @param {string} type */
function functionLabel(value, type) {
	if (/^class\b/u.test(Function.prototype.toString.call(value))) {
		type = "Class";
	}
	/** @type {unknown} */
	const name = Object.getOwnPropertyDescriptor(value, "name")?.value;
	const named = typeof name === "string" && name !== "";
	if (named) {
		return `[${type}: ${name}]`;
	}
	return `[${type}]`;
}

/** @param {object} value @param {string} type */
function bufferLabel(value, type) {
	if (value instanceof DataView) {
		if (Reflect.get(value.buffer, "detached") === true) {
			return "DataView { <detached> }";
		}
		return `DataView { byteLength: ${value.byteLength}, byteOffset: ${value.byteOffset} }`;
	}
	const buffer = value instanceof ArrayBuffer || value instanceof SharedArrayBuffer;
	if (buffer) {
		if (Reflect.get(value, "detached") === true) {
			return `${type} { <detached> }`;
		}
		return `${type}(${value.byteLength})`;
	}
	return undefined;
}

const UNKNOWN_ENTRIES = "<entries unknown>";
const opaqueStates = new Map([
	["WeakMap", UNKNOWN_ENTRIES],
	["WeakSet", UNKNOWN_ENTRIES],
	["FinalizationRegistry", UNKNOWN_ENTRIES],
	["WeakRef", "<state unknown>"],
	["Promise", "<state unknown>"],
]);

/** @param {object} value @param {string} type */
function builtinLabel(value, type) {
	const state = opaqueStates.get(type);
	if (state !== undefined) {
		return `${type} { ${state} }`;
	}
	if (value instanceof Date) {
		return dateLabel(value);
	}
	if (value instanceof RegExp) {
		return RegExp.prototype.toString.call(value);
	}
	if (value instanceof Error) {
		return Error.prototype.toString.call(value);
	}
	return boxedLabel(value, type) ?? bufferLabel(value, type) ?? `[${type}]`;
}

/** @param {Date} value */
function dateLabel(value) {
	if (Number.isNaN(Date.prototype.getTime.call(value))) {
		return "Invalid Date";
	}
	return Date.prototype.toISOString.call(value);
}

/** @param {object} value @param {string} type */
function boxedLabel(value, type) {
	for (const wrapper of [Boolean, Number, String, BigInt, Symbol]) {
		if (value instanceof wrapper) {
			const primitive = wrapper.prototype.valueOf.call(value);
			if (typeof primitive === "string") {
				return `${type}(${stringLiteral(primitive)})`;
			}
			return `${type}(${scalar(primitive)})`;
		}
	}
	return undefined;
}

/** @param {unknown} key @param {Map<object, string>} labels */
function mapKey(key, labels) {
	const property = typeof key === "string" || typeof key === "symbol";
	if (property) {
		return fieldLabel(key);
	}
	if (!isReference(key)) {
		return `[${scalar(key)}]`;
	}
	return identityLabel(key, labels);
}

/** @param {object} key @param {Map<object, string>} labels */
function identityLabel(key, labels) {
	const prior = labels.get(key);
	if (prior !== undefined) {
		return prior;
	}
	// Identity is still useful when the key is a revoked proxy.
	let type = OBJECT_TYPE;
	try {
		type = labelText(typeName(key));
	} catch {
		// The key itself cannot be inspected.
	}
	const label = `${type}#${labels.size + FIRST_ID}`;
	labels.set(key, label);
	return label;
}

/** @param {Map<unknown, unknown>} map @param {Map<object, string>} labels @returns {Generator<Entry>} */
function* mapEntries(map, labels) {
	for (const [key, value] of Map.prototype.entries.call(map)) {
		yield { label: mapKey(key, labels), value };
	}
}

// Read built-in metadata from its prototype, not from potentially shadowing accessors.
/** @param {object} prototype @param {string} key @param {object} receiver */
function builtinSize(prototype, key, receiver) {
	return String(Reflect.get(prototype, key, receiver));
}

/** @param {object} value @param {Map<object, string>} labels @returns {Group | string} */
function describe(value, labels) {
	if (Array.isArray(value)) {
		return { header: `Array(${value.length})`, entries: fields(value) };
	}
	if (value instanceof Map) {
		return { header: `Map(${builtinSize(Map.prototype, "size", value)})`, entries: mapEntries(value, labels) };
	}
	if (value instanceof Set) {
		return {
			header: `Set(${builtinSize(Set.prototype, "size", value)})`,
			entries: indexed(Set.prototype.values.call(value)),
		};
	}
	return describeObject(value);
}

/** @param {object} value @returns {value is { length: number } & Iterable<number | bigint>} */
function isTypedArray(value) {
	return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

/** @param {object} value @returns {Group | string} */
function describeObject(value) {
	const type = typeName(value);
	if (isTypedArray(value)) {
		const length = builtinSize(Uint8Array.prototype, "length", value);
		return { header: `${type}(${length})`, entries: indexed(Uint8Array.prototype.values.call(value)) };
	}
	if (typeof value === "function") {
		return functionLabel(value, type);
	}
	if (type === OBJECT_TYPE) {
		return { entries: fields(value) };
	}
	return builtinLabel(value, type);
}

/** @param {string} path @param {string} label */
function childPath(path, label) {
	const field = path !== "" && !label.startsWith("[");
	if (field) {
		return `${path}.${label}`;
	}
	return path + label;
}

/** @param {string} path @param {string} indent */
function prefix(path, indent) {
	if (path === "") {
		return indent;
	}
	return `${indent}${path}: `;
}

class Formatter {
	/** @type {Set<object>} */
	ancestors = new Set();
	/** @type {Map<object, string>} */
	keyLabels = new Map();
	/** @type {string[]} */
	lines = [];

	/** @param {unknown} value @param {string} path @param {string} indent */
	visit(value, path, indent) {
		if (typeof value === "string") {
			this.lines.push(stringLiteral(value, path, indent));
		} else if (!isReference(value)) {
			this.lines.push(prefix(path, indent) + scalar(value));
		} else if (this.ancestors.has(value)) {
			this.lines.push(`${prefix(path, indent)}[Circular]`);
		} else {
			this.inspect(value, path, indent);
		}
	}

	/** @param {object} value @param {string} path @param {string} indent */
	inspect(value, path, indent) {
		const start = this.lines.length;
		this.ancestors.add(value);
		try {
			this.writeShape(describe(value, this.keyLabels), path, indent);
		} catch {
			// A revoked proxy (or throwing inspection trap) should not hide sibling values.
			this.lines.length = start;
			this.lines.push(prefix(path, indent) + UNINSPECTABLE);
		} finally {
			this.ancestors.delete(value);
		}
	}

	/** @param {Group | string} shape @param {string} path @param {string} indent */
	writeShape(shape, path, indent) {
		if (typeof shape === "string") {
			this.lines.push(prefix(path, indent) + shape);
		} else if (shape.header !== undefined) {
			this.lines.push(prefix(path, indent) + shape.header);
			if (path !== "") {
				indent += INDENT;
			}
			this.writeEntries(shape.entries, "", indent);
		} else {
			this.writeFields(shape.entries, path, indent);
		}
	}

	/** @param {Iterable<Entry>} entries @param {string} path @param {string} indent */
	writeFields(entries, path, indent) {
		const start = this.lines.length;
		this.writeEntries(entries, path, indent);
		if (start === this.lines.length) {
			this.lines.push(`${prefix(path, indent)}{}`);
		}
	}

	/** @param {Iterable<Entry>} entries @param {string} path @param {string} indent */
	writeEntries(entries, path, indent) {
		for (const entry of entries) {
			const child = childPath(path, entry.label);
			if ("literal" in entry) {
				this.lines.push(`${indent}${child}: ${entry.literal}`);
			} else {
				this.visit(entry.value, child, indent);
			}
		}
	}
}

// The wrapper invokes these entry points from the same sandbox scope.
// oxlint-disable-next-line no-unused-vars
function formatConsoleArgument(/** @type {unknown} */ value) {
	try {
		if (value instanceof Error) {
			return value; // Let QuickJS's console include the stack frames.
		}
	} catch {
		return UNINSPECTABLE;
	}
	return format(value);
}

/** @param {unknown} value */
function format(value) {
	const formatter = new Formatter();
	formatter.visit(value, "", "");
	return formatter.lines.join("\n");
}
