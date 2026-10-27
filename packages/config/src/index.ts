import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";

export type ConfigLocation = { scope: "global" } | { scope: "project"; projectDir: string; trusted: boolean };

/** Read optional JSONC without validation, defaults, or merging. The caller owns project trust. */
export function readConfig(filename: string, location: ConfigLocation): unknown {
	if (!filename || filename === "." || filename === ".." || /[/\\]/u.test(filename)) {
		throw new Error("Config filename must be a filename, not a path.");
	}
	if (location.scope === "project" && !location.trusted) {
		return undefined;
	}

	const directory = location.scope === "global" ? getAgentDir() : join(location.projectDir, ".pi");
	const path = join(directory, filename);
	let source: string;
	try {
		source = readFileSync(path, "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return undefined;
		}
		throw new Error(`Could not read config ${path}.`, { cause: error });
	}
	
	const errors: ParseError[] = [];
	const value: unknown = parse(source, errors, { allowTrailingComma: true });
	const error = errors[0];
	if (error) {
		throw new Error(`Invalid JSONC in ${path}: ${printParseErrorCode(error.error)} at offset ${error.offset}.`);
	}
	
	return value;
}
