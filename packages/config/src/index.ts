import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";

import { z } from "zod";

export const ConfigScope = {
	Global: "global",
	Project: "project",
} as const;

export type ConfigScope = (typeof ConfigScope)[keyof typeof ConfigScope];

export type ConfigLocation =
	{ scope: typeof ConfigScope.Global } | { scope: typeof ConfigScope.Project; projectDir: string; trusted: boolean };

/** Read and validate one optional JSONC file. The caller owns the schema, project trust, and merging. */
export function readConfig<T>(filename: string, location: ConfigLocation, schema: z.ZodType<T>): T | undefined {
	if (!filename || filename === "." || filename === ".." || /[/\\]/u.test(filename)) {
		throw new Error("Config filename must be a filename, not a path.");
	}
	if (location.scope === ConfigScope.Project && !location.trusted) {
		return undefined;
	}

	const directory = location.scope === ConfigScope.Global ? getAgentDir() : join(location.projectDir, ".pi");
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

	const result = schema.safeParse(value);
	if (!result.success) {
		throw new Error(`Invalid config ${path}: ${z.prettifyError(result.error)}`, { cause: result.error });
	}
	return result.data;
}
