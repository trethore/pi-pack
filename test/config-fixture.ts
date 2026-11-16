import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface ConfigFixture {
	directory: string;
	path: string;
}

const ConfigFixture = {
	create(filename: string): ConfigFixture {
		const directory = mkdtempSync(join(tmpdir(), "pi-pack-config-"));
		return { directory, path: join(directory, filename) };
	},
	remove(fixture: ConfigFixture): void {
		rmSync(fixture.directory, { recursive: true, force: true });
	},
};

export { ConfigFixture };
