import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../dist/sandbox/", import.meta.url);
const config = { root, configFile: false, envDir: false, publicDir: false, logLevel: "warn" };
await mkdir(output, { recursive: true });
const prelude = await build({
  ...config,
  build: {
    write: false,
    minify: false,
    target: "es2024",
    lib: {
      entry: "src/sandbox/prelude/index.ts",
      name: "Prelude",
      formats: ["iife"],
    },
    rolldownOptions: {
      platform: "neutral",
      output: { exports: "named" },
    },
  },
});
const outputs = Array.isArray(prelude) ? prelude : [prelude];
const chunks = outputs.flatMap((result) => result.output);
const chunk = chunks[0];
if (chunks.length !== 1 || chunk.type !== "chunk" || chunk.imports.length > 0 || chunk.dynamicImports.length > 0) {
  throw new Error("The QuickJS prelude must be a single bundle without external imports");
}
await writeFile(new URL("prelude.js", output), `(function () {\n${chunk.code}\nreturn Prelude.default;\n})()`);
await build({
  ...config,
  ssr: { external: true },
  build: {
    ssr: true,
    outDir: fileURLToPath(output),
    emptyOutDir: false,
    minify: false,
    target: "node22",
    sourcemap: true,
    lib: {
      entry: "src/sandbox/worker.ts",
      formats: ["es"],
      fileName: () => "worker.js",
    },
  },
});
