import { configFilename, featureValueKey, SettingName } from "#src/constants";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FILE_NOT_FOUND_CODE = "ENOENT";
const EMPTY_CONFIG_SOURCE = "{}\n";
const EXCLUSIVE_WRITE_FLAG = "wx";
const PRIVATE_FILE_MODE = 0o600;
const NO_ERRORS = 0;

const SettingsFile = {
	read(path: string): string {
		try {
			return readFileSync(path, "utf8");
		} catch (error) {
			const fileNotFound = error instanceof Error && "code" in error && error.code === FILE_NOT_FOUND_CODE;
			if (fileNotFound) {
				return EMPTY_CONFIG_SOURCE;
			}
			throw error;
		}
	},
	edit(source: string, name: string, value: unknown): string {
		const errors: ParseError[] = [];
		const parsed: unknown = parse(source, errors, { allowTrailingComma: true });
		const validConfig = errors.length === NO_ERRORS && typeof parsed === "object" && parsed !== null
			&& !Array.isArray(parsed);
		if (!validConfig) {
			throw new Error("Cannot save settings: the global config must be a valid JSONC object.");
		}
		const path = [name];
		if (name !== SettingName.Enabled) {
			path.push(featureValueKey);
		}
		return applyEdits(source, modify(source, path, value, { formattingOptions: { insertSpaces: false } }));
	},
	save(name: string, value: unknown): void {
		const directory = getAgentDir();
		const path = join(directory, configFilename);
		const source = SettingsFile.edit(SettingsFile.read(path), name, value);
		mkdirSync(directory, { recursive: true });
		SettingsFile.replace(path, source);
	},
	replace(path: string, source: string): void {
		const temporaryPath = `${path}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temporaryPath, source, { flag: EXCLUSIVE_WRITE_FLAG, mode: PRIVATE_FILE_MODE });
			// Rename within the same directory so readers never observe a partial config.
			renameSync(temporaryPath, path);
		} finally {
			rmSync(temporaryPath, { force: true });
		}
	},
};

export { SettingsFile };
