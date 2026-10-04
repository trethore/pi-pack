import { defineConfig } from "oxlint";

export default defineConfig({
  options: {
    typeAware: true,
    denyWarnings: true,
  },
  plugins: ["typescript", "unicorn", "oxc"],
  // These categories include the core safety rules and supported type-aware rules.
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  env: {
    node: true,
  },
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "references/**",
    "pi/**",
    "**/*.tgz",
    ".pi/**",
  ],
  rules: {
    curly: "error",
    "unicorn/no-array-sort": "off",
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            regex: "^\\.{1,2}(/|$)",
            message: "Use a package import or a package.json imports alias instead of a relative import.",
          },
        ],
      },
    ],
    complexity: ["error", 10],
    "max-depth": ["error", 3],
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      rules: {
        "no-undef": "off",
        // Oxlint uses one TypeScript-aware rule, not a separate typescript/no-unused-vars rule.
        "no-unused-vars": [
          "error",
          {
            args: "all",
            argsIgnorePattern: "^_",
            caughtErrors: "all",
            caughtErrorsIgnorePattern: "^_",
          },
        ],
        "typescript/no-explicit-any": "error",
        "typescript/no-dynamic-delete": "error",
        "typescript/no-misused-promises": "error",
        "typescript/no-unnecessary-condition": "error",
        "typescript/no-unsafe-argument": "error",
        "typescript/no-unsafe-assignment": "error",
        "typescript/no-unsafe-call": "error",
        "typescript/no-unsafe-member-access": "error",
        "typescript/no-unsafe-return": "error",
        "typescript/require-await": "error",
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
    },
    {
      files: ["**/test/**/*.ts"],
      rules: {
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/require-await": "off",
        "typescript/unbound-method": "off",
      },
    },
    {
      files: ["packages/shared/src/unsafe/**/*.ts"],
      rules: {
        "typescript/no-unnecessary-condition": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/no-dynamic-delete": "off",
        "typescript/no-unsafe-return": "off",
      },
    },
  ],
});
