import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { clearWorkspaces, getWorkspace } from "#src/workspace";
import { countingScript, useWorkspace } from "#test/workspace";

const files = useWorkspace();

it("runs lazily, shares in-flight work, and retains exact output until reload", async () => {
  // Arrange
  await files.script("platform", countingScript("  stable\n\n"));
  const { templates } = await files.load();
  expect(await files.runs()).toBe("");

  // Act
  const results = await Promise.all([
    templates?.expand("{{platform}} / {{platform}}"),
    templates?.expand("{{platform}}"),
  ]);
  await files.script("platform", countingScript("changed"));
  const cached = await templates?.expand("{{platform}}");
  clearWorkspaces();
  const reloaded = await files.load();
  const fresh = await reloaded.templates?.expand("{{platform}}");

  // Assert
  expect(results).toEqual(["  stable\n /   stable\n", "  stable\n"]);
  expect(cached).toBe("  stable\n");
  expect(fresh).toBe("changed");
  expect(await files.runs()).toBe("xx");
});

it("prefers project scripts across extensions and warns without absolute paths", async () => {
  // Arrange
  await files.script("platform", countingScript("global"), "global", "js");
  await files.script("platform", countingScript("project"));
  const workspace = await files.load();

  // Act
  const output = await workspace.templates?.expand("{{platform}} {{platform}}");

  // Assert
  expect(output).toBe("project project");
  expect(workspace.warnings).toEqual([
    'pi-script-templates: "platform" exists globally and in the project; using the project script.',
  ]);
  expect(await files.runs()).toBe("x");
});

it("rejects ambiguous scripts in the winning scope without global fallback", async () => {
  // Arrange
  await files.script("platform", countingScript("global"), "global");
  await files.script("platform", countingScript("project"));
  await files.script("platform", countingScript("ambiguous"), "project", "js");
  const workspace = await files.load();

  // Act
  const output = await workspace.templates?.expand("{{platform}} {{platform}}");

  // Assert
  expect(output).toBe("{{platform}} {{platform}}");
  expect(await files.runs()).toBe("");
  expect(workspace.warnings).toHaveLength(2);
  expect(workspace.warnings[1]).toContain("both .js and .mjs scripts in project scope");
});

it("does not let ambiguity in the overridden global scope block a project script", async () => {
  // Arrange
  await files.script("platform", "", "global");
  await files.script("platform", "", "global", "js");
  await files.script("platform", countingScript("project"));
  const workspace = await files.load();

  // Act / Assert
  expect(await workspace.templates?.expand("{{platform}}")).toBe("project");
  expect(workspace.warnings).toHaveLength(1);
});

it("passes the active workspace and template identity and inherits environment variables", async () => {
  // Arrange
  vi.stubEnv("PI_SCRIPT_TEMPLATES_TEST", "inherited");
  await files.script(
    "node-version",
    `process.stdout.write(JSON.stringify([
    process.cwd(), process.env.PI_WORKSPACE_CWD, process.env.PI_SCRIPT_TEMPLATE_NAME,
    process.env.PI_SCRIPT_TEMPLATE_SCOPE, process.env.PI_SCRIPT_TEMPLATES_TEST
  ]));`,
    "global",
  );
  const workspace = await files.load();

  // Act
  const output = await workspace.templates?.expand("{{node-version}}");

  // Assert
  expect(JSON.parse(output ?? "null")).toEqual([files.cwd, files.cwd, "node-version", "global", "inherited"]);
});

it("caches missing scripts and retries discovery only after reload", async () => {
  // Arrange
  const workspace = await files.load();

  // Act
  const first = await workspace.templates?.expand("{{missing}} {{missing}}");
  await files.script("missing", countingScript("found"));
  const second = await workspace.templates?.expand("{{missing}}");
  clearWorkspaces();
  const reloaded = await files.load();

  // Assert
  expect(first).toBe("{{missing}} {{missing}}");
  expect(second).toBe("{{missing}}");
  expect(workspace.warnings).toHaveLength(1);
  expect(await reloaded.templates?.expand("{{missing}}")).toBe("found");
});

it("caches failures without leaking stderr and retries only after reload", async () => {
  // Arrange
  await files.script("failure", `${countingScript("partial")}\nconsole.error(process.cwd()); process.exit(2);`);
  const workspace = await files.load();

  // Act
  const first = await workspace.templates?.expand("{{failure}}");
  await files.script("failure", countingScript("recovered"));
  const second = await workspace.templates?.expand("{{failure}}");
  clearWorkspaces();
  const reloaded = await files.load();

  // Assert
  expect(first).toBe("{{failure}}");
  expect(second).toBe(first);
  expect(workspace.warnings).toEqual([
    'pi-script-templates: "failure" (project): script exited unsuccessfully; placeholder left unchanged until /reload.',
  ]);
  expect(await reloaded.templates?.expand("{{failure}}")).toBe("recovered");
  expect(await files.runs()).toBe("xx");
});

it("does not recursively expand script output or interpret replacement metacharacters", async () => {
  // Arrange
  await files.script("literal", countingScript("{{other}} $& $1"));
  await files.script("other", countingScript("unwanted"));
  const workspace = await files.load();

  // Act / Assert
  expect(await workspace.templates?.expand("{{literal}}")).toBe("{{other}} $& $1");
  expect(await files.runs()).toBe("x");
});

it("accepts simple names but never resolves paths, whitespace, or JavaScript expressions", async () => {
  // Arrange
  await files.script("OS_1-x", countingScript("valid"));
  const workspace = await files.load();
  const invalid = "{{../secret}} {{sub/name}} {{ node }} {{process.env.HOME}}";

  // Act / Assert
  expect(await workspace.templates?.expand(`{{OS_1-x}} ${invalid}`)).toBe(`valid ${invalid}`);
  expect(workspace.warnings).toEqual([]);
});

it("does not execute unused scripts or scripts while disabled", async () => {
  // Arrange
  await files.script("unused", countingScript("unused"));
  await files.configure({ enabled: false });

  // Act
  const workspace = await files.load();

  // Assert
  expect(workspace.templates).toBeUndefined();
  expect(await files.runs()).toBe("");
});

it("uses global scripts in untrusted projects without probing project scripts", async () => {
  // Arrange
  await files.script("platform", countingScript("global"), "global");
  await files.script("platform", countingScript("project"));
  const workspace = await files.load(false);

  // Act / Assert
  expect(await workspace.templates?.expand("{{platform}}")).toBe("global");
  expect(workspace.warnings).toEqual([]);
});

it("keeps global-script results separate for different workspaces", async () => {
  // Arrange
  await files.script("cwd", "process.stdout.write(process.env.PI_WORKSPACE_CWD);", "global");
  const otherCwd = join(files.root, "other");
  await mkdir(otherCwd);
  const first = await files.load();
  const second = await getWorkspace(otherCwd, files.agentDir, true);

  // Act / Assert
  expect(await first.templates?.expand("{{cwd}}")).toBe(files.cwd);
  expect(await second.templates?.expand("{{cwd}}")).toBe(otherCwd);
});

it("supports script symlinks and ignores directories with script-like names", async () => {
  // Arrange
  const target = join(files.root, "target.mjs");
  await writeFile(target, countingScript("linked"));
  await symlink(target, join(files.directory("global"), "script-templates", "linked.mjs"));
  await mkdir(join(files.directory("project"), "script-templates", "linked.js"));
  const workspace = await files.load();

  // Act / Assert
  expect(await workspace.templates?.expand("{{linked}}")).toBe("linked");
  expect(workspace.warnings).toEqual([]);
});

it("treats absent script directories as empty and warns on unreadable ones", async () => {
  // Arrange
  await rm(join(files.directory("project"), "script-templates"), { recursive: true });
  const globalDirectory = join(files.agentDir, "script-templates");
  await rm(globalDirectory, { recursive: true });
  await writeFile(globalDirectory, "not a directory");

  // Act
  const workspace = await files.load();

  // Assert
  expect(workspace.warnings).toEqual(["pi-script-templates: Could not read global script-templates directory."]);
});
