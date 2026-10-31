import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [{ find: /^#test\/(.+)$/, replacement: fileURLToPath(new URL("./test/$1.ts", import.meta.url)) }],
	},
	test: {
		environment: "node",
		include: ["packages/*/test/**/*.test.ts", "test/**/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
	},
});
