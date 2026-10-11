import { readFile, writeFile } from "node:fs/promises";
import { compilePrompts } from "#scripts/prompts";

const source = new URL("../src/prompts/prompts.yaml", import.meta.url);
const output = new URL("../src/prompts/generated.ts", import.meta.url);
const generated = await compilePrompts(await readFile(source, "utf8"));
await writeFile(output, generated);
