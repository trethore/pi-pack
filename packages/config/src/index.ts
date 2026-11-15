import { defineEnum, type EnumValue } from "@a-box-of-scraps/ts-utils";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { parse, type ParseError, printParseErrorCode } from "jsonc-parser";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const scopeBrand = Symbol("ConfigScope");

const ConfigScope = defineEnum(scopeBrand, {
	Global: "global",
	Project: "project",
});

type ConfigScope = EnumValue<typeof ConfigScope>;

type ConfigLocation =
	| { readonly scope: typeof ConfigScope.Global }
	| {
		readonly scope: typeof ConfigScope.Project;
		readonly projectDir: string;
		readonly trusted: boolean;
	};

const ConfigLocation = {
	isProject(location: ConfigLocation): location is Extract<ConfigLocation, { scope: typeof ConfigScope.Project }> {
		return location.scope === ConfigScope.Project;
	},
	directory(location: ConfigLocation): string | undefined {
		if (ConfigLocation.isProject(location)) {
			if (!location.trusted) {
				return undefined;
			}
			return join(location.projectDir, ".pi");
		}
		return getAgentDir();
	},
};

const ConfigFile = {
	validateFilename(filename: string): void {
		if (filename === "" || filename === "." || filename === ".." || /[/\\\0]/u.test(filename)) {
			throw new Error("Config filename must be a filename, not a path.");
		}
	},

	read(path: string): string | undefined {
		try {
			return readFileSync(path, "utf8");
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				return undefined;
			}
			throw new Error(`Could not read config ${path}.`, { cause: error });
		}
	},

	parse<Output>(source: string, path: string, schema: z.ZodType<Output>): Output {
		const errors: ParseError[] = [];
		const value: unknown = parse(source, errors, { allowTrailingComma: true });
		const [error] = errors;
		if (error !== undefined) {
			throw new Error(`Invalid JSONC in ${path}: ${printParseErrorCode(error.error)} at offset ${error.offset}.`);
		}

		const result = schema.safeParse(value);
		if (!result.success) {
			throw new Error(`Invalid config ${path}: ${z.prettifyError(result.error)}`, { cause: result.error });
		}
		return result.data;
	},
};

/** Read one optional JSONC file. The caller owns the schema, project trust, and merging. */
function readConfig<Output>(filename: string, location: ConfigLocation, schema: z.ZodType<Output>): Output | undefined {
	ConfigFile.validateFilename(filename);
	const directory = ConfigLocation.directory(location);
	if (directory === undefined) {
		return undefined;
	}
	const path = join(directory, filename);
	const source = ConfigFile.read(path);
	if (source === undefined) {
		return undefined;
	}
	return ConfigFile.parse(source, path, schema);
}

export { type ConfigLocation, ConfigScope, readConfig };
