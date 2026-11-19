import dedent from "dedent";

export const Fixtures = {
	consoleFormatting(level: string): string {
		return dedent`
			const value = { at: new Date(0), counts: new Map([["ok", 2]]) };
			value.self = value;
			console.${level}("result", value);
			text(value);
			return value;
		`;
	},
};
