import { fileURLToPath } from "node:url";
export const CODEMODE_TOOL_NAME = "codemode";
export const CODEMODE_STORE_ENTRY_TYPE = "codemode-store";
export const CODEMODE_DOCS_PATH = fileURLToPath(new URL("../manual/codemode.md", import.meta.url));
