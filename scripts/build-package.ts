import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

async function main(): Promise<void> {
	// Resolve TypeScript from the package, preserving workspace-specific compiler versions.
	const packageRequire = createRequire(resolve("package.json"));
	const compilerDirectory = dirname(packageRequire.resolve("typescript/package.json"));

	await build({ configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)) });

	execFileSync(process.execPath, [
		resolve(compilerDirectory, "bin/tsc"),
		"--project",
		resolve("tsconfig.build.json"),
	], { stdio: "inherit" });

	execFileSync(process.execPath, [
		fileURLToPath(new URL("bundle-types.ts", import.meta.url)),
	], { stdio: "inherit" });
}

await main();
