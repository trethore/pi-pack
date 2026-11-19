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

/** @param {string} path @param {string} value */
function leaf(path, value) {
	if (path === "") {
		return value;
	}
	if (value.includes("\n")) {
		return `${path}:\n${value}`;
	}
	return `${path}: ${value}`;
}

/** @param {unknown} value @param {Set<object>} ancestors */
function mapPart(value, ancestors) {
	if (typeof value === "string") {
		return JSON.stringify(value);
	}
	return format(value, "", ancestors);
}

/** @param {Map<unknown, unknown>} map @param {Set<object>} ancestors */
function formatMap(map, ancestors) {
	const entries = [];
	for (const [key, value] of map) {
		entries.push(`${mapPart(key, ancestors)} => ${mapPart(value, ancestors)}`);
	}
	if (!entries.length) {
		return "Map(0) {}";
	}
	return `Map(${map.size}) { ${entries.join(", ")} }`;
}

/** @param {object} value @param {string} path @param {Set<object>} ancestors */
function formatObject(value, path, ancestors) {
	if (value instanceof Map) {
		return leaf(path, formatMap(value, ancestors));
	}
	const array = Array.isArray(value);
	const entries = Object.entries(value);
	if (!entries.length) {
		if (array) {
			return leaf(path, "[]");
		}
		return leaf(path, "{}");
	}
	return entries.map(([key, item]) => format(item, fieldPath(path, key, array), ancestors)).join("\n");
}

/** @param {object} value @param {string} path @param {Set<object>} ancestors */
function formatBranch(value, path, ancestors) {
	if (ancestors.has(value)) {
		return leaf(path, "[Circular]");
	}

	// Only ancestors are circular; sibling paths can share the same object.
	ancestors.add(value);
	const formatted = formatObject(value, path, ancestors);
	ancestors.delete(value);
	return formatted;
}

/**
 * Called by the QuickJS wrapper before text() can escape nested strings.
 * @param {unknown} value
 * @param {string} path
 * @param {Set<object>} ancestors
 * @returns {string}
 */
function format(value, path = "", ancestors = new Set()) {
	const isScalar = value === null || typeof value !== "object" || value instanceof Error;
	if (isScalar) {
		// Only primitives and Error instances use their native string representation.
		// eslint-disable-next-line typescript/no-base-to-string
		return leaf(path, String(value));
	}
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) {
			return leaf(path, "Invalid Date");
		}
		return leaf(path, value.toISOString());
	}
	return formatBranch(value, path, ancestors);
}
