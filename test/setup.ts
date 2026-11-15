import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const testHome = mkdtempSync(path.join(tmpdir(), "pi-pack-test-home-"));
const environment = {
	HOME: testHome,
	USERPROFILE: testHome,
	APPDATA: path.join(testHome, "AppData", "Roaming"),
	LOCALAPPDATA: path.join(testHome, "AppData", "Local"),
	XDG_CONFIG_HOME: path.join(testHome, ".config"),
	XDG_CACHE_HOME: path.join(testHome, ".cache"),
	XDG_DATA_HOME: path.join(testHome, ".local", "share"),
	XDG_STATE_HOME: path.join(testHome, ".local", "state"),
};
const originalEnvironment = new Map(
	Object.keys(environment).map((name) => [name, process.env[name]]),
);

// Redirect home-based configuration without changing the working directory.
afterAll(() => {
	for (const [name, value] of originalEnvironment) {
		if (value === undefined) {
			Reflect.deleteProperty(process.env, name);
		} else {
			process.env[name] = value;
		}
	}

	rmSync(testHome, { recursive: true, force: true });
});

// Prepare platform-specific directories for libraries that use native paths.
const directories = [
	...Object.values(environment),
	"Library/Preferences",
	"Library/Application Support",
	"Library/Caches",
];
for (const directory of directories) {
	mkdirSync(path.resolve(testHome, directory), { recursive: true });
}

for (const [name, directory] of Object.entries(environment)) {
	process.env[name] = directory;
}
