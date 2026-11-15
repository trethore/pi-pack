import { isAbsolute, resolve } from "node:path";
import { rollup } from "rollup";
import { dts } from "rollup-plugin-dts";

const bundle = await rollup({
	input: resolve("dist/types/index.d.ts"),
	// Keep package imports external, including workspace dependencies reached through symlinks.
	external: (id) => !isAbsolute(id) && !id.startsWith(".") && !id.startsWith("#src/"),
	plugins: [dts({
		respectExternal: true,
		tsconfig: resolve("tsconfig.build.json"),
		compilerOptions: {
			paths: { "#src/*": [resolve("dist/types/*.d.ts")] },
		},
	})],
});

try {
	await bundle.write({ file: resolve("dist/index.d.ts"), format: "es" });
} finally {
	await bundle.close();
}
