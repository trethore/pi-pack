import { EXTENSION_NAME } from "#src/constants";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadConfig } from "#src/config";

let root: string;
let cwd: string;
let agentDir: string;
const warn = vi.fn();

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "shell-config-"));
  cwd = join(root, "project");
  agentDir = join(root, "agent");
  await Promise.all([mkdir(join(cwd, ".pi"), { recursive: true }), mkdir(agentDir)]);
  warn.mockClear();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function load(projectTrusted = true) {
  return loadConfig(cwd, { agentDir, projectTrusted, onWarning: warn });
}

function configure(source: string, global = false) {
  return writeFile(join(global ? agentDir : join(cwd, ".pi"), `${EXTENSION_NAME}.jsonc`), source);
}

it("uses the agreed defaults", async () => {
  // Act / Assert
  await expect(load()).resolves.toEqual({
    enabled: true,
    surfaces: { system: true, appendSystem: true, promptTemplates: true },
    execution: { shell: "/bin/sh", timeoutMs: 3000, maxOutputChars: 1000 },
  });
});

it("uses trusted project JSONC instead of merging global configuration", async () => {
  // Arrange
  await configure('{"enabled":false,"execution":{"shell":"/bin/bash"}}', true);
  await configure('{ // local\n "surfaces":{"system":false,}, "execution":{"timeoutMs":50}}');

  // Act / Assert
  await expect(load()).resolves.toMatchObject({
    enabled: true,
    surfaces: { system: false, appendSystem: true },
    execution: { shell: "/bin/sh", timeoutMs: 50, maxOutputChars: 1000 },
  });
});

it("ignores untrusted project configuration", async () => {
  // Arrange
  await configure("invalid");
  await configure('{"enabled":false}', true);

  // Act / Assert
  await expect(load(false)).resolves.toMatchObject({ enabled: false });
});

it.each([
  '{"enabled":null}',
  '{"surfaces":[]}',
  '{"surfaces":{"system":1}}',
  '{"execution":null}',
  '{"execution":{"shell":null}}',
  '{"execution":{"shell":"sh"}}',
  '{"execution":{"timeoutMs":0}}',
  '{"execution":{"timeoutMs":2147483648}}',
  '{"execution":{"maxOutputChars":-1}}',
  '{"execution":{"maxOutputChars":1.5}}',
  '{"execution":{"maxOutputChars":"10"}}',
])("rejects invalid configuration without falling back: %s", async (source) => {
  // Arrange
  await configure("{}", true);
  await configure(source);

  // Act / Assert
  await expect(load()).rejects.toThrow("invalid configuration");
});

it("warns about unknown root and nested configuration keys", async () => {
  // Arrange
  await configure('{"enabld":true,"surfaces":{"templates":true},"execution":{"timeout":100}}');

  // Act
  await load();

  // Assert
  expect(warn).toHaveBeenCalledTimes(3);
  expect(warn.mock.calls.flat().join("\n")).toMatch(/enabld/);
  expect(warn.mock.calls.flat().join("\n")).toMatch(/templates/);
  expect(warn.mock.calls.flat().join("\n")).toMatch(/timeout/);
});
