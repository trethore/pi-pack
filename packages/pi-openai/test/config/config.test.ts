import { mkdir, readdir, rm, stat } from "node:fs/promises";
import * as files from "@pi-pack/shared/files";
import { parseConfig } from "@pi-pack/shared/config";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadConfiguration, saveConfiguration, saveDestination } from "#src/config/files";
import { resolveSettings } from "#src/config/settings";
import { createWorkspace, settings } from "#test/support";

let workspace: Awaited<ReturnType<typeof createWorkspace>>;
beforeEach(async () => {
  workspace = await createWorkspace();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await workspace.dispose();
});

it("loads JSONC layers and lets project null cancel a global override", async () => {
  // Arrange
  await workspace.write("global", '{ // global\n "verbosity": "high", "webSearch": true, }');
  await workspace.write("project", '{"verbosity":null}');

  // Act
  const loaded = await loadConfiguration(workspace.paths, {
    projectTrusted: true,
    environment: { PI_OPENAI_SERVICE_TIER: "fast" },
  });
  const result = resolveSettings(loaded);

  // Assert
  expect(result.values).toEqual(settings({ verbosity: null, webSearch: true, serviceTier: "priority" }));
  expect(result.sources.verbosity).toBe("project");
  expect(result.sources.webSearch).toBe("global");
  expect(result.sources.serviceTier).toBe("environment");
});

it("uses defaults and selects global when no configuration exists", async () => {
  // Act
  const loaded = await loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} });

  // Assert
  expect(resolveSettings(loaded).values).toEqual(settings());
  await expect(saveDestination(workspace.paths, { projectTrusted: true })).resolves.toBe("global");
});

it.each(["global", "project"] as const)(
  "reports invalid %s configuration without falling back",
  async (destination) => {
    // Arrange
    await workspace.write(destination, '{"verbosity":"invalid"}');

    // Act / Assert
    await expect(loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} })).rejects.toThrow(
      `Invalid ${destination} configuration: verbosity`,
    );
  },
);

it.each(["{", "null", "[]", "", '{"enabled":1}'])("rejects invalid document %s", async (source) => {
  // Arrange
  await workspace.write("project", source);

  // Act / Assert
  await expect(loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} })).rejects.toThrow(
    "Invalid project configuration",
  );
});

it("does not hide invalid environment settings behind disabled config", async () => {
  // Arrange
  await workspace.write("project", '{"enabled":false}');

  // Act / Assert
  await expect(
    loadConfiguration(workspace.paths, {
      projectTrusted: true,
      environment: { PI_OPENAI_VERBOSITY: "secret-invalid-value" },
    }),
  ).rejects.toThrow("PI_OPENAI_VERBOSITY must be one of");
});

it("reports unreadable files without exposing paths in the message", async () => {
  // Arrange
  await mkdir(workspace.paths.project);

  // Act / Assert
  await expect(loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} })).rejects.toThrow(
    "Could not read project configuration.",
  );
  await expect(loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} })).rejects.not.toThrow(
    workspace.root,
  );
});

it("selects an existing project config over global and notices new files", async () => {
  // Arrange
  await workspace.write("global", "{}");

  // Act / Assert
  await expect(saveDestination(workspace.paths, { projectTrusted: true })).resolves.toBe("global");
  await workspace.write("project", "{}");
  await expect(saveDestination(workspace.paths, { projectTrusted: true })).resolves.toBe("project");
});

it.each(["global", "project"] as const)(
  "creates %s configuration and missing parent directories",
  async (destination) => {
    // Arrange
    const values = settings({ verbosity: "low", reasoningSummary: "none", allowUnsupported: true });
    await rm(destination === "global" ? workspace.agentDir : workspace.cwd, { recursive: true });

    // Act
    await saveConfiguration(workspace.paths, destination, values, { projectTrusted: true });

    // Assert
    expect(parseConfig(await workspace.read(destination))).toEqual(values);
    expect((await stat(workspace.paths[destination])).mode & 0o777).toBe(0o600);
  },
);

it("preserves comments, unknown keys, line endings and saved nulls", async () => {
  // Arrange
  const original = '{\r\n  // keep this\r\n  "verbosity": "high", // inline\r\n  "future": {"nested":42},\r\n}\r\n';
  await workspace.write("project", original);
  const values = settings({ reasoningSummary: "none", serviceTier: "priority" });

  // Act
  await saveConfiguration(workspace.paths, "project", values, { projectTrusted: true });
  const source = await workspace.read("project");

  // Assert
  expect(source).toContain("// keep this");
  expect(source).toContain("// inline");
  expect(source.replaceAll("\r\n", "")).not.toContain("\n");
  expect(parseConfig(source)).toEqual({ ...values, future: { nested: 42 } });
  expect(await readdir(workspace.cwd + "/.pi")).toEqual(["pi-openai.jsonc"]);
});

it("refuses to overwrite malformed configuration", async () => {
  // Arrange
  await workspace.write("project", "{invalid");

  // Act / Assert
  await expect(saveConfiguration(workspace.paths, "project", settings(), { projectTrusted: true })).rejects.toThrow(
    "Invalid project configuration",
  );
  expect(await workspace.read("project")).toBe("{invalid");
});

it("reports unreadable save targets without creating temporary files", async () => {
  // Arrange
  const paths = { ...workspace.paths, project: workspace.agentDir + "/block/config.jsonc" };
  await workspace.write("global", "{}");
  await mkdir(paths.project, { recursive: true });

  // Act / Assert
  await expect(saveConfiguration(paths, "project", settings(), { projectTrusted: true })).rejects.toThrow(
    "Could not read project configuration",
  );
  expect(await readdir(workspace.agentDir + "/block")).toEqual(["config.jsonc"]);
});

it("rejects duplicate setting keys instead of saving a misleading effective value", async () => {
  // Arrange
  const source = '{"verbosity":"high", "verbosity":"low"}';
  await workspace.write("project", source);

  // Act / Assert
  await expect(loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} })).rejects.toThrow(
    "Duplicate setting: verbosity",
  );
  await expect(saveConfiguration(workspace.paths, "project", settings(), { projectTrusted: true })).rejects.toThrow(
    "Duplicate setting: verbosity",
  );
  expect(await workspace.read("project")).toBe(source);
});

it("uses a custom warning reporter instead of UI notifications", async () => {
  // Arrange
  await workspace.write("project", '{"verbosty":"high"}');
  const notify = vi.fn();
  const onWarning = vi.fn();

  // Act
  await loadConfiguration(workspace.paths, { projectTrusted: true, environment: {}, ui: { notify }, onWarning });

  // Assert
  expect(onWarning.mock.calls).toEqual([
    ['pi-openai: project configuration: Unknown configuration entries: "verbosty".'],
  ]);
  expect(notify).not.toHaveBeenCalled();
});

it.each(["valid", "malformed", "unreadable"])("ignores %s project configuration when untrusted", async (kind) => {
  // Arrange
  await workspace.write("global", '{"verbosity":"high","webSearch":true}');
  if (kind === "unreadable") {
    await mkdir(workspace.paths.project);
  } else {
    await workspace.write("project", kind === "valid" ? '{"verbosity":"low","unknown":true}' : "{invalid");
  }
  const read = vi.spyOn(files, "readOptionalFile");
  const onWarning = vi.fn();

  // Act
  const loaded = await loadConfiguration(workspace.paths, {
    projectTrusted: false,
    environment: { PI_OPENAI_VERBOSITY: "medium" },
    onWarning,
  });

  // Assert
  expect(loaded.project).toEqual({});
  expect(loaded.global).toEqual({ verbosity: "high", webSearch: true });
  expect(resolveSettings(loaded).values).toEqual(settings({ verbosity: "medium", webSearch: true }));
  expect(read.mock.calls).toEqual([[workspace.paths.global]]);
  expect(onWarning).not.toHaveBeenCalled();
});

it("uses defaults when untrusted and only project configuration exists", async () => {
  // Arrange
  await workspace.write("project", '{"verbosity":"high"}');

  // Act
  const loaded = await loadConfiguration(workspace.paths, { projectTrusted: false, environment: {} });

  // Assert
  expect(loaded.project).toEqual({});
  expect(resolveSettings(loaded).values).toEqual(settings());
});

it("selects global without inspecting project configuration when untrusted", async () => {
  // Arrange
  await workspace.write("project", "{}");
  const inspect = vi.fn(() => workspace.paths.project);
  const paths = {
    global: workspace.paths.global,
    get project() {
      return inspect();
    },
  };

  // Act
  const destination = await saveDestination(paths, { projectTrusted: false });

  // Assert
  expect(destination).toBe("global");
  expect(inspect).not.toHaveBeenCalled();
});

it("rejects untrusted project saves before accessing the target", async () => {
  // Arrange
  await workspace.write("project", "{invalid");
  const read = vi.spyOn(files, "readOptionalFile");
  const target = vi.fn(() => workspace.paths.project);
  const paths = {
    global: workspace.paths.global,
    get project() {
      return target();
    },
  };

  // Act / Assert
  await expect(saveConfiguration(paths, "project", settings(), { projectTrusted: false })).rejects.toThrow(
    "Project is not trusted; refusing to save project configuration.",
  );
  expect(read).not.toHaveBeenCalled();
  expect(target).not.toHaveBeenCalled();
  expect(await workspace.read("project")).toBe("{invalid");
});

it("allows global saves while untrusted without touching project configuration", async () => {
  // Arrange
  await workspace.write("project", "{invalid");
  const values = settings({ verbosity: "high" });

  // Act
  await saveConfiguration(workspace.paths, "global", values, { projectTrusted: false });

  // Assert
  expect(parseConfig(await workspace.read("global"))).toEqual(values);
  expect(await workspace.read("project")).toBe("{invalid");
});
