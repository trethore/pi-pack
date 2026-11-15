import { configFilename, featureValueKey, SettingName } from "#src/constants";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const fileNotFoundCode = "ENOENT";
const emptyConfigSource = "{}\n";
const exclusiveWriteFlag = "wx";
const privateFileMode = 0o600;
const noErrors = 0;

const SettingsFile = {
	read(path: string): string {
		try {
			return readFileSync(path, "utf8");
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === fileNotFoundCode) {
				return emptyConfigSource;
			}
			throw error;
		}
	},
	edit(source: string, name: string, value: unknown): string {
		const errors: ParseError[] = [];
		const parsed: unknown = parse(source, errors, { allowTrailingComma: true });
		if (errors.length !== noErrors || typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
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
			writeFileSync(temporaryPath, source, { flag: exclusiveWriteFlag, mode: privateFileMode });
			// Rename within the same directory so readers never observe a partial config.
			renameSync(temporaryPath, path);
		} finally {
			rmSync(temporaryPath, { force: true });
		}
	},
};

export { SettingsFile };
