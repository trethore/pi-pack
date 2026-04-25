import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const ignoredFolders = [
  'node_modules/**',
  'dist/**',
  'coverage/**',
  'references/**',
  '*.tgz',
  '.pi/**',
];

export default defineConfig([
  {
    ignores: ignoredFolders,
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  unicorn.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/no-null': 'off',
      'complexity': ['error', 10],
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
]);
