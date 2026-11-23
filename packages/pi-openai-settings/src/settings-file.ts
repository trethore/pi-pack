import { configFilename, featureValueKey, SettingName } from "#src/constants";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FILE_NOT_FOUND_CODE = "ENOENT";
const EMPTY_CONFIG_SOURCE = "{}\n";
const EXCLUSIVE_WRITE_FLAG = "wx";
const PRIVATE_FILE_MODE = 0o600;
const NO_ERRORS = 0;

const SettingsFile = {
	async read(path: string): Promise<string> {
		try {
			return await readFile(path, "utf8");
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
	async save(name: string, value: unknown): Promise<void> {
		const directory = getAgentDir();
		const path = join(directory, configFilename);
		const source = SettingsFile.edit(await SettingsFile.read(path), name, value);
		await mkdir(directory, { recursive: true });
		await SettingsFile.replace(path, source);
	},
	async replace(path: string, source: string): Promise<void> {
		const temporaryPath = `${path}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporaryPath, source, { flag: EXCLUSIVE_WRITE_FLAG, mode: PRIVATE_FILE_MODE });
			// Rename within the same directory so readers never observe a partial config.
			await rename(temporaryPath, path);
		} finally {
			await rm(temporaryPath, { force: true });
		}
	},
};

export { SettingsFile };
