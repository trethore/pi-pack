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

/**
 * Called by the QuickJS wrapper before text() can escape nested strings.
 * @param {unknown} value
 * @param {string} path
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
function format(value, path = "") {
	const isScalar = value === null || typeof value !== "object" || value instanceof Error;
	if (isScalar) {
		// Only primitives and Error instances use their native string representation.
		// eslint-disable-next-line typescript/no-base-to-string
		return leaf(path, String(value));
	}

	const array = Array.isArray(value);
	const entries = Object.entries(value);
	if (!entries.length) {
		if (array) {
			return leaf(path, "[]");
		}
		return leaf(path, "{}");
	}
	return entries.map(([key, item]) => format(item, fieldPath(path, key, array))).join("\n");
}
