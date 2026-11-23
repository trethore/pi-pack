import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const SUCCESS = 0;

async function runNode(args: string[]): Promise<void> {
	const child = spawn(process.execPath, args, { stdio: "inherit" });
	await once(child, "close");
	if (child.exitCode !== SUCCESS) {
		throw new Error(`Node exited with ${String(child.signalCode ?? child.exitCode)}`);
	}
}

async function main(): Promise<void> {
	// Resolve TypeScript from the package, preserving workspace-specific compiler versions.
	const packageRequire = createRequire(resolve("package.json"));
	const compilerDirectory = dirname(packageRequire.resolve("typescript/package.json"));

	await build({ configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)) });

	await runNode([
		resolve(compilerDirectory, "bin/tsc"),
		"--project",
		resolve("tsconfig.build.json"),
	]);

	await runNode([
		fileURLToPath(new URL("bundle-types.ts", import.meta.url)),
	]);
}

await main();
