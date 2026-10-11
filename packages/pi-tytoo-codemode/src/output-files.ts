import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function writeOutputFile(prefix: string, extension: string, data: string | Uint8Array): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const path = join(directory, `output${extension}`);
  await writeFile(path, data, { mode: 0o600 });
  return path;
}
