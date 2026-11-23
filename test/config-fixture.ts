import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

interface ConfigFixture {
	readonly path: string;
}

const ConfigFixture = {
	use(filename: string): ConfigFixture {
		const fixture = { directory: "", path: "" };

		beforeEach(async () => {
			fixture.directory = await mkdtemp(join(tmpdir(), "pi-pack-config-"));
			fixture.path = join(fixture.directory, filename);
			vi.mocked(getAgentDir).mockReturnValue(fixture.directory);
		});

		afterEach(async () => {
			await rm(fixture.directory, { recursive: true, force: true });
			vi.mocked(getAgentDir).mockReset();
		});

		return fixture;
	},
};

export { ConfigFixture };
