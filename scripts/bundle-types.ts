import { isAbsolute, resolve } from "node:path";
import { rolldown } from "rolldown";
import { dts } from "rolldown-plugin-dts";

const bundle = await rolldown({
	input: resolve("dist/types/index.d.ts"),
	// Keep package imports external, including workspace dependencies reached through symlinks.
	external: (id) => !isAbsolute(id) && !id.startsWith(".") && !id.startsWith("#src/"),
	plugins: [
		{
			name: "declaration-source-alias",
			resolveId: {
				order: "pre",
				filter: { id: /^#src\//u },
				handler(id) {
					return resolve("dist/types", `${id.slice("#src/".length)}.d.ts`);
				},
			},
		},
		dts({
			dtsOnly: true,
			generator: "oxc",
			resolver: "oxc",
			tsconfig: resolve("tsconfig.build.json"),
		}),
	],
});

try {
	await bundle.write({ file: resolve("dist/index.d.ts"), format: "es" });
} finally {
	await bundle.close();
}
