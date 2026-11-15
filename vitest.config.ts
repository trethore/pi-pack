import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [{
			find: /^#shared-test\/(?<helper>.+)$/,
			replacement: fileURLToPath(new URL("test/$1.ts", import.meta.url)),
		}],
	},
	test: {
		coverage: {
			provider: "v8",
			include: ["packages/*/src/**/*.ts"],
			thresholds: {
				perFile: true,
				lines: 80,
				functions: 80,
				branches: 80,
				statements: 80,
			},
			reporter: ["text-summary", "html", "lcov"],
			reportsDirectory: "./coverage",
		},
		environment: "node",
		setupFiles: ["./test/setup.ts"],
		include: ["packages/*/test/**/*.test.ts", "test/**/*.test.ts"],
	},
});
