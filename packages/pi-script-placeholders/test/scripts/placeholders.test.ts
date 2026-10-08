import { expect, it, vi } from "vitest";
import { Scope } from "#src/constants";
import { clearWorkspaces } from "#src/workspace";
import { countingScript, useWorkspace } from "#test/workspace";

const files = useWorkspace();

it("runs lazily, shares in-flight work, and retains exact output until reload", async () => {
  // Arrange
  await files.script("platform", countingScript("  stable\n\n"));
  const { placeholders } = await files.load();
  expect(await files.runs()).toBe("");

  // Act
  const results = await Promise.all([
    placeholders?.expand("{{platform}} / {{platform}}"),
    placeholders?.expand("{{platform}}"),
  ]);
  await files.script("platform", countingScript("changed"));
  const cached = await placeholders?.expand("{{platform}}");
  clearWorkspaces();
  const reloaded = await files.load();
  const fresh = await reloaded.placeholders?.expand("{{platform}}");

  // Assert
  expect(results).toEqual(["  stable\n /   stable\n", "  stable\n"]);
  expect(cached).toBe("  stable\n");
  expect(fresh).toBe("changed");
  expect(await files.runs()).toBe("xx");
});

it("passes the active workspace and placeholder identity and inherits environment variables", async () => {
  // Arrange
  vi.stubEnv("PI_SCRIPT_PLACEHOLDERS_TEST", "inherited");
  await files.script(
    "node-version",
    `process.stdout.write(JSON.stringify([
    process.cwd(), process.env.PI_WORKSPACE_CWD, process.env.PI_SCRIPT_PLACEHOLDER_NAME,
    process.env.PI_SCRIPT_PLACEHOLDER_SCOPE, process.env.PI_SCRIPT_PLACEHOLDERS_TEST
  ]));`,
    Scope.GLOBAL,
  );
  const workspace = await files.load();

  // Act
  const output = await workspace.placeholders?.expand("{{node-version}}");

  // Assert
  expect(JSON.parse(output ?? "null")).toEqual([files.cwd, files.cwd, "node-version", "global", "inherited"]);
});

it("caches missing scripts and retries discovery only after reload", async () => {
  // Arrange
  const workspace = await files.load();

  // Act
  const first = await workspace.placeholders?.expand("{{missing}} {{missing}}");
  await files.script("missing", countingScript("found"));
  const second = await workspace.placeholders?.expand("{{missing}}");
  clearWorkspaces();
  const reloaded = await files.load();

  // Assert
  expect(first).toBe("{{missing}} {{missing}}");
  expect(second).toBe("{{missing}}");
  expect(workspace.warnings).toHaveLength(1);
  expect(await reloaded.placeholders?.expand("{{missing}}")).toBe("found");
});

it("caches failures without leaking stderr and retries only after reload", async () => {
  // Arrange
  await files.script("failure", `${countingScript("partial")}\nconsole.error(process.cwd()); process.exit(2);`);
  const workspace = await files.load();

  // Act
  const first = await workspace.placeholders?.expand("{{failure}}");
  await files.script("failure", countingScript("recovered"));
  const second = await workspace.placeholders?.expand("{{failure}}");
  clearWorkspaces();
  const reloaded = await files.load();

  // Assert
  expect(first).toBe("{{failure}}");
  expect(second).toBe(first);
  expect(workspace.warnings).toEqual([
    'pi-script-placeholders: "failure" (project): script exited unsuccessfully; placeholder left unchanged until /reload.',
  ]);
  expect(await reloaded.placeholders?.expand("{{failure}}")).toBe("recovered");
  expect(await files.runs()).toBe("xx");
});

it("does not recursively expand script output or interpret replacement metacharacters", async () => {
  // Arrange
  await files.script("literal", countingScript("{{other}} $& $1"));
  await files.script("other", countingScript("unwanted"));
  const workspace = await files.load();

  // Act / Assert
  expect(await workspace.placeholders?.expand("{{literal}}")).toBe("{{other}} $& $1");
  expect(await files.runs()).toBe("x");
});

it("accepts simple names but never resolves paths, whitespace, or JavaScript expressions", async () => {
  // Arrange
  await files.script("OS_1-x", countingScript("valid"));
  const workspace = await files.load();
  const invalid = "{{../secret}} {{sub/name}} {{ node }} {{process.env.HOME}}";

  // Act / Assert
  expect(await workspace.placeholders?.expand(`{{OS_1-x}} ${invalid}`)).toBe(`valid ${invalid}`);
  expect(workspace.warnings).toEqual([]);
});
