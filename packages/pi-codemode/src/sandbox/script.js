/** @param {string} path @param {string} key */
function fieldPath(path, key) {
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

/** @param {string} path @param {string} header @param {string[]} entries */
function listing(path, header, entries) {
	return [leaf(path, header), ...entries].join("\n");
}

/** @param {string} path @param {string | number} index */
function indexPath(path, index) {
	if (path === "") {
		return String(index);
	}
	return `${path}[${index}]`;
}

/** @param {unknown[]} array @param {string} path @param {Set<object>} ancestors */
function formatArray(array, path, ancestors) {
	const entries = Object.entries(array).map(([key, item]) => {
		const index = /^(?:0|[1-9]\d*)$/u.test(key) && Number(key) < array.length;
		if (index) {
			return render(item, indexPath(path, key), ancestors);
		}
		return render(item, fieldPath(path, key), ancestors);
	});
	return listing(path, `Array(${array.length})`, entries);
}

/** @param {string} path @param {unknown} key @param {Set<object>} ancestors */
function mapPath(path, key, ancestors) {
	if (typeof key === "string") {
		return fieldPath(path, key);
	}
	return indexPath(path, render(key, undefined, ancestors));
}

/** @param {Map<unknown, unknown>} map @param {string | undefined} path @param {Set<object>} ancestors */
function formatMap(map, path, ancestors) {
	const header = `Map(${map.size})`;
	if (path === undefined) {
		const entries = Array.from(
			map,
			([key, item]) => `${render(key, undefined, ancestors)} => ${render(item, undefined, ancestors)}`,
		);
		return `${header} ${braces(entries)}`;
	}
	const entries = Array.from(map, ([key, item]) => render(item, mapPath(path, key, ancestors), ancestors));
	return listing(path, header, entries);
}

/** @param {Iterable<unknown>} value @param {string | undefined} path @param {Set<object>} ancestors */
function formatIndexed(value, path, ancestors) {
	const type = Object.prototype.toString.call(value).replace(/^\[object |\]$/gu, "");
	if (path !== undefined) {
		const entries = Array.from(value, (item, index) => render(item, indexPath(path, index), ancestors));
		return listing(path, `${type}(${entries.length})`, entries);
	}
	const items = Array.from(value, (item) => render(item, undefined, ancestors));
	const header = `${type}(${items.length})`;
	if (value instanceof Set) {
		return `${header} ${braces(items)}`;
	}
	return `${header} [${items.join(", ")}]`;
}

/** @param {object} value @param {string | undefined} path @param {Set<object>} ancestors */
function formatCollection(value, path, ancestors) {
	const listArray = Array.isArray(value) && path !== undefined;
	if (listArray) {
		return formatArray(value, path, ancestors);
	}
	if (value instanceof Map) {
		return formatMap(value, path, ancestors);
	}
	const indexed = value instanceof Set || (ArrayBuffer.isView(value) && !(value instanceof DataView));
	if (indexed) {
		return formatIndexed(value, path, ancestors);
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
	return formatOpaque(value) ?? formatBoxed(value);
}

/** @param {object} value */
function formatOpaque(value) {
	if (value instanceof WeakMap) {
		return "WeakMap { <entries unknown> }";
	}
	if (value instanceof WeakSet) {
		return "WeakSet { <entries unknown> }";
	}
	if (value instanceof ArrayBuffer) {
		return `ArrayBuffer(${value.byteLength})`;
	}
	if (value instanceof DataView) {
		return `DataView { byteLength: ${value.byteLength}, byteOffset: ${value.byteOffset} }`;
	}
	return undefined;
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
	const collection = formatCollection(value, path, ancestors);
	if (collection !== undefined) {
		return collection;
	}
	const builtin = formatBuiltin(value);
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
	const entries = Object.entries(value);
	if (!entries.length) {
		return leaf(path, "{}");
	}
	return entries.map(([key, item]) => render(item, fieldPath(path, key), ancestors)).join("\n");
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
// The runtime wrapper calls this entry point from the same sandbox scope.
// oxlint-disable-next-line no-unused-vars
function format(value) {
	return render(value, "", new Set());
}
