import { readFileSync } from "node:fs";

export { CodemodeSandbox } from "#src/sandbox/sandbox";
export type { CodemodeTool } from "#src/sandbox/types";
export { MAX_OUTPUT_CHARS, MAX_OUTPUT_ITEMS } from "#src/sandbox/limits";
export {
  renderDeclarations,
  renderToolSample,
  renderToolSignature,
  mcpStructuredContentSchema,
} from "#src/declarations/render";
export { schemaToType } from "#src/declarations/schema";
export { CodemodeSourceError, parseCodemodeSource } from "#src/source/parse";
export const PRELUDE_SOURCE = readFileSync(new URL("../../dist/sandbox/prelude.js", import.meta.url), "utf8");
