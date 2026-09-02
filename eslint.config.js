import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const ignoredFolders = ['node_modules/**', 'dist/**', 'coverage/**', 'references/**', '*.tgz', '.pi/**'];

export default defineConfig([
  {
    ignores: ignoredFolders,
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  unicorn.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowAny: false,
          allowBoolean: false,
          allowNever: false,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false,
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-array-sort': 'off',
      complexity: ['error', 10],
      'max-depth': ['error', 3],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['packages/shared/src/unsafe/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['**/*.js'],
  },
]);
