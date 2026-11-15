import { readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Workspace build scripts run with the package directory as their working directory.
const manifest: unknown = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
	throw new TypeError("Expected a package.json object");
}
const dependencies = ["dependencies", "peerDependencies", "optionalDependencies"].flatMap((group) => {
	const entries: unknown = Reflect.get(manifest, group);
	if (typeof entries === "object" && entries !== null && !Array.isArray(entries)) {
		return Object.keys(entries);
	}
	return [];
});

export default defineConfig({
	resolve: {
		alias: [{ find: /^#src\/(?<module>.+)$/, replacement: resolve("src/$1.ts") }],
	},
	build: {
		target: "es2024",
		minify: false,
		sourcemap: true,
		rolldownOptions: {
			external: (id) =>
				isBuiltin(id) || dependencies.some((dependency) => id === dependency || id.startsWith(`${dependency}/`)),
		},
		lib: {
			entry: resolve("src/index.ts"),
			formats: ["es"],
			fileName: "index",
		},
	},
});
