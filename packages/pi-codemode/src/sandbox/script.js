/** @param {string} path @param {string} key @param {boolean} array */
function fieldPath(path, key, array) {
	const isIndex = array && /^(?:0|[1-9]\d*)$/u.test(key);
	if (isIndex) {
		return `${path}[${key}]`;
	}
	if (!/^[A-Za-z_$][\w$]*$/u.test(key)) {
		return `${path}[${JSON.stringify(key)}]`;
	}
	if (path === "") {
		return key;
	}
	return `${path}.${key}`;
}

/** @param {string | undefined} path @param {string} value */
function leaf(path, value) {
	const standalone = path === "" || path === undefined;
	if (standalone) {
		return value;
	}
	if (value.includes("\n")) {
		return `${path}:\n${value}`;
	}
	return `${path}: ${value}`;
}

/** @param {string[]} entries */
function braces(entries) {
	if (!entries.length) {
		return "{}";
	}
	return `{ ${entries.join(", ")} }`;
}

/** @param {object} value @param {Set<object>} ancestors */
function formatCollection(value, ancestors) {
	/** @param {unknown} part */
	function inline(part) {
		return render(part, undefined, ancestors);
	}
	if (value instanceof Map) {
		return `Map(${value.size}) ${braces(Array.from(value, ([key, item]) => `${inline(key)} => ${inline(item)}`))}`;
	}
	if (value instanceof Set) {
		return `Set(${value.size}) ${braces(Array.from(value, inline))}`;
	}
	if (value instanceof WeakMap) {
		return "WeakMap { <entries unknown> }";
	}
	if (value instanceof WeakSet) {
		return "WeakSet { <entries unknown> }";
	}
	return undefined;
}

/** @param {object} value */
function formatBinary(value) {
	if (value instanceof ArrayBuffer) {
		return `ArrayBuffer(${value.byteLength})`;
	}
	if (value instanceof DataView) {
		return `DataView { byteLength: ${value.byteLength}, byteOffset: ${value.byteOffset} }`;
	}
	if (ArrayBuffer.isView(value)) {
		const type = Object.prototype.toString.call(value).replace(/^\[object |\]$/gu, "");
		const items = Array.from(value, (item) => format(item));
		return `${type}(${items.length}) [${items.join(", ")}]`;
	}
	return undefined;
}

/** @param {object} value */
function formatBuiltin(value) {
	if (value instanceof RegExp) {
		return value.toString();
	}
	if (value instanceof Promise) {
		return "Promise { <state unknown> }";
	}
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) {
			return "Invalid Date";
		}
		return value.toISOString();
	}
	return formatBoxed(value) ?? formatBinary(value);
}

/** @param {object} value */
function formatBoxed(value) {
	for (const wrapper of [Boolean, Number, String, BigInt, Symbol]) {
		if (value instanceof wrapper) {
			return `${wrapper.name}(${render(wrapper.prototype.valueOf.call(value), undefined, new Set())})`;
		}
	}
	return undefined;
}

/** @param {object} value @param {Set<object>} ancestors */
function formatInline(value, ancestors) {
	const entries = Object.entries(value);
	const dense = Array.isArray(value) && entries.length === value.length
		&& entries.every(([key], index) => key === String(index));
	if (dense) {
		return `[${entries.map(([, item]) => render(item, undefined, ancestors)).join(", ")}]`;
	}
	const fields = braces(entries.map(([key, item]) => `${JSON.stringify(key)}: ${render(item, undefined, ancestors)}`));
	if (Array.isArray(value)) {
		return `Array(${value.length}) ${fields}`;
	}
	return fields;
}

/** @param {object} value @param {string | undefined} path @param {Set<object>} ancestors */
function formatObject(value, path, ancestors) {
	const builtin = formatCollection(value, ancestors) ?? formatBuiltin(value);
	if (builtin !== undefined) {
		return leaf(path, builtin);
	}
	if (path === undefined) {
		return formatInline(value, ancestors);
	}
	return formatFields(value, path, ancestors);
}

/** @param {object} value @param {string} path @param {Set<object>} ancestors */
function formatFields(value, path, ancestors) {
	const array = Array.isArray(value);
	const entries = Object.entries(value);
	if (!entries.length) {
		if (array) {
			return leaf(path, "[]");
		}
		return leaf(path, "{}");
	}
	return entries.map(([key, item]) => render(item, fieldPath(path, key, array), ancestors)).join("\n");
}

/** @param {unknown} value @param {boolean} inline */
function formatScalar(value, inline) {
	const NEGATIVE_ZERO = -0;
	if (typeof value === "bigint") {
		return `${value}n`;
	}
	if (Object.is(value, NEGATIVE_ZERO)) {
		return "-0";
	}
	const quoteString = inline && typeof value === "string";
	if (quoteString) {
		return JSON.stringify(value);
	}
	// Only primitives and Error instances use their native string representation.
	return String(value);
}

/**
 * An undefined path renders a collection member inline; an empty path starts a flat listing.
 * @param {unknown} value
 * @param {string | undefined} path
 * @param {Set<object>} ancestors
 * @returns {string}
 */
function render(value, path, ancestors) {
	const isScalar = value === null || typeof value !== "object" || value instanceof Error;
	if (isScalar) {
		return leaf(path, formatScalar(value, path === undefined));
	}
	if (ancestors.has(value)) {
		return leaf(path, "[Circular]");
	}

	// Only ancestors are circular; sibling paths can share the same object.
	ancestors.add(value);
	const formatted = formatObject(value, path, ancestors);
	ancestors.delete(value);
	return formatted;
}

/** @param {unknown} value */
function format(value) {
	return render(value, "", new Set());
}
