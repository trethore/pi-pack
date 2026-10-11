import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../dist/sandbox/", import.meta.url);
await mkdir(output, { recursive: true });
const prelude = await build({
  absWorkingDir: root,
  entryPoints: ["src/sandbox/prelude/index.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "Prelude",
  platform: "neutral",
  target: "es2024",
  metafile: true,
});
if (Object.values(prelude.metafile.outputs).some((entry) => entry.imports.length > 0)) {
  throw new Error("The QuickJS prelude must not import external modules");
}
await writeFile(
  new URL("prelude.js", output),
  `(function () {\n${prelude.outputFiles[0].text}\nreturn Prelude.default;\n})()`,
);
await build({
  absWorkingDir: root,
  entryPoints: ["src/sandbox/worker.ts"],
  outfile: fileURLToPath(new URL("worker.js", output)),
  bundle: true,
  packages: "external",
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: true,
});
