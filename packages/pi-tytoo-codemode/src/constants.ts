import { join } from "node:path";
import { getDocsPath } from "@earendil-works/pi-coding-agent";
export const CODEMODE_TOOL_NAME = "codemode";
export const CODEMODE_STORE_ENTRY_TYPE = "codemode-store";
export const CODEMODE_DOCS_PATH = join(getDocsPath(), "codemode.md");
