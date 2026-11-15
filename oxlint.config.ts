import { defineConfig, type OxlintConfig } from "oxlint";

const maintainabilityRules = {
	"func-style": ["error", "declaration"],
	"one-var": ["error", "never"],
	// Object order can be meaningful; dprint handles import ordering.
	"sort-keys": "off",
	"sort-imports": "off",
	curly: "error",
	"unicorn/no-array-sort": "off",

	complexity: ["error", 15],
	"max-depth": ["error", 4],

	"max-lines": ["error", { max: 600, skipBlankLines: true, skipComments: true }],
	"max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],

	"no-else-return": "error",

	"no-unused-vars": [
		"error",
		{
			args: "all",
			argsIgnorePattern: "^_",
			caughtErrors: "all",
			caughtErrorsIgnorePattern: "^_",
		},
	],
} satisfies NonNullable<OxlintConfig["rules"]>;

const importRules = {
	// Public utilities use named exports, and this workspace targets Node.js.
	"import/no-named-export": "off",
	"import/prefer-default-export": "off",
	"import/no-nodejs-modules": "off",
	"import/consistent-type-specifier-style": ["error", "prefer-inline"],
	"no-duplicate-imports": "off",

	"import/first": "error",
	"import/default": "error",
	"import/namespace": "error",
	"import/no-namespace": "error",
	"import/no-cycle": "error",
	"import/no-duplicates": ["error", { preferInline: true }],

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
} satisfies NonNullable<OxlintConfig["rules"]>;

const typeSafetyRules = {
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
	"typescript/strict-boolean-expressions": "error",
	"typescript/use-unknown-in-catch-callback-variable": "error",
} satisfies NonNullable<OxlintConfig["rules"]>;

export default defineConfig({
	plugins: ["import", "oxc", "typescript", "unicorn", "vitest"],
	categories: {
		correctness: "error",
		suspicious: "error",
		perf: "error",
		style: "error",
	},
	env: {
		node: true,
	},
	ignorePatterns: ["**/dist/**", "**/coverage/**"],
	options: {
		typeAware: true,
		denyWarnings: true,
		reportUnusedDisableDirectives: "error",
	},
	overrides: [
		{
			files: ["*.config.ts"],
			rules: {
				"no-magic-numbers": "off",
			},
		},
		{
			files: ["test/**/*.ts", "packages/*/test/**/*.ts"],
			rules: {
				"vitest/require-top-level-describe": "off",
				"vitest/no-hooks": "off",
				"vitest/no-importing-vitest-globals": "off",
			},
		},
	],
	rules: {
		...maintainabilityRules,
		...importRules,
		...typeSafetyRules,
	},
});
