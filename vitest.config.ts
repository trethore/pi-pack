import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/test/**'],
    },
  },
});
