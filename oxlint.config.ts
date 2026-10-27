import { defineConfig } from "oxlint";

export default defineConfig({
	plugins: ["typescript", "oxc", "unicorn", "vitest"],
	categories: {
		correctness: "error",
		suspicious: "error",
	},
	env: {
		node: true,
	},
	ignorePatterns: ["pi/**", "**/dist/**", "**/coverage/**"],
	options: {
		typeAware: true,
		denyWarnings: true,
		reportUnusedDisableDirectives: "error",
	},
	rules: {
		curly: "error",
		"unicorn/no-array-sort": "off",
		complexity: ["error", 15],
		"max-depth": ["error", 4],
		"no-duplicate-imports": "error",

		"no-unused-vars": [
			"error",
			{
				args: "all",
				argsIgnorePattern: "^_",
				caughtErrors: "all",
				caughtErrorsIgnorePattern: "^_",
			},
		],

		"no-restricted-imports": [
			"error",
			{
				patterns: [
					{
						group: [".", "..", "./**", "../**"],
						message: "Use a # import mapping or a package import instead of a relative import.",
					},
				],
			},
		],

		"typescript/no-explicit-any": "error",
		"typescript/no-dynamic-delete": "error",
		"typescript/no-unnecessary-condition": "error",
		"typescript/await-thenable": "error",
		"typescript/no-floating-promises": "error",
		"typescript/no-misused-promises": "error",
		"typescript/no-unsafe-argument": "error",
		"typescript/no-unsafe-assignment": "error",
		"typescript/no-unsafe-call": "error",
		"typescript/no-unsafe-member-access": "error",
		"typescript/no-unsafe-return": "error",
		"typescript/restrict-template-expressions": [
			"error",
			{
				allowAny: false,
				allowBoolean: false,
				allowNever: false,
				allowNullish: false,
				allowNumber: true,
				allowRegExp: false,
			},
		],
		"typescript/switch-exhaustiveness-check": "error",
	},
});
