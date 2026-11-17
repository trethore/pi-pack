/// <reference types="vite/client" />
import sandboxScript from "#sandbox-script?raw";
import dedent from "dedent";

const prefix = dedent`
	const text = value => globalThis.text(format(value));
	const result = await (async () => {
`;
const suffix = dedent`
	})();
	if (result !== undefined) text(result);
`;

export const Script = {
	wrap(code: string): string {
		// Only dedent the wrapper. Indentation and escapes in script literals are data.
		return [prefix, code, suffix, sandboxScript].join("\n");
	},
};
