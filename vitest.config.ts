import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["packages/*/test/**/*.test.ts", "test/**/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
	},
});
