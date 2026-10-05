import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Scope } from "#src/constants";
import { useWorkspace } from "#test/workspace";

const files = useWorkspace();

it("defaults to all surfaces and bounded execution", async () => {
  // Act
  const workspace = await files.load();

  // Assert
  expect(workspace.config).toEqual({
    enabled: true,
    surfaces: { system: true, appendSystem: true, promptTemplates: true },
    execution: { timeoutMs: 3000, maxOutputChars: 1000 },
  });
  expect(workspace.warnings).toEqual([]);
});

it("reads global JSONC and applies defaults within partial sections", async () => {
  // Arrange
  await files.configure('{ // limits\n "execution": {"timeoutMs": 500,}, "surfaces":{"system":false,},}', Scope.GLOBAL);

  // Act
  const { config } = await files.load();

  // Assert
  expect(config?.surfaces).toEqual({ system: false, appendSystem: true, promptTemplates: true });
  expect(config?.execution).toEqual({ timeoutMs: 500, maxOutputChars: 1000 });
});

it("uses the project configuration rather than merging global values", async () => {
  // Arrange
  await files.configure({ enabled: false, execution: { timeoutMs: 12 } }, Scope.GLOBAL);
  await files.configure({ surfaces: { appendSystem: false } });

  // Act
  const { config } = await files.load();

  // Assert
  expect(config?.enabled).toBe(true);
  expect(config?.execution.timeoutMs).toBe(3000);
  expect(config?.surfaces.appendSystem).toBe(false);
});

it.each([
  "{",
  "null",
  "[]",
  '{"enabled":1}',
  '{"surfaces":[]}',
  '{"execution":null}',
  '{"surfaces":{"system":"yes"}}',
  '{"surfaces":{"appendSystem":0}}',
  '{"surfaces":{"promptTemplates":null}}',
  '{"execution":{"timeoutMs":0}}',
  '{"execution":{"timeoutMs":2147483648}}',
  '{"execution":{"timeoutMs":1.5}}',
  '{"execution":{"maxOutputChars":-1}}',
  '{"execution":{"maxOutputChars":"1000"}}',
])("disables invalid project configuration without leaking paths or falling back: %s", async (source) => {
  // Arrange
  await files.configure({}, Scope.GLOBAL);
  await files.configure(source);

  // Act
  const workspace = await files.load();

  // Assert
  expect(workspace.config).toBeUndefined();
  expect(workspace.templates).toBeUndefined();
  expect(workspace.warnings).toEqual([
    "pi-script-templates: Invalid project configuration; extension disabled until /reload.",
  ]);
});

it("reports an unreadable config without a filesystem error or full path", async () => {
  // Arrange
  await mkdir(join(files.directory(Scope.PROJECT), "pi-script-templates.jsonc"));

  // Act
  const { warnings } = await files.load();

  // Assert
  expect(warnings).toEqual([
    "pi-script-templates: Could not read project configuration; extension disabled until /reload.",
  ]);
});

it("warns about unknown keys without echoing arbitrary configuration contents", async () => {
  // Arrange
  await files.configure({ privatePath: files.root, surfaces: { typo: true }, execution: { typo: 1 } });

  // Act
  const workspace = await files.load();

  // Assert
  expect(workspace.config?.enabled).toBe(true);
  expect(workspace.warnings).toHaveLength(3);
  expect(workspace.warnings.join("\n")).not.toContain(files.root);
});

it("does not read untrusted project configuration", async () => {
  // Arrange
  await files.configure({ enabled: false }, Scope.GLOBAL);
  await files.configure("invalid project configuration");

  // Act
  const workspace = await files.load(false);

  // Assert
  expect(workspace.config?.enabled).toBe(false);
  expect(workspace.warnings).toEqual([]);
});
