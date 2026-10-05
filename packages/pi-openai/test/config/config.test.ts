import * as filesystem from "node:fs/promises";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import * as files from "@pi-pack/shared/files";
import { parseConfig } from "@pi-pack/shared/config";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Destination, ServiceTier, Verbosity, ReasoningSummary } from "#src/constants";
import { loadConfiguration, saveConfiguration, defaultDestination } from "#src/config/files";
import { resolveSettings, Setting } from "#src/config/settings";
import { createWorkspace, model, settings } from "#test/support";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, rename: vi.fn(original.rename) };
});

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
  await workspace.write(Destination.GLOBAL, '{ // global\n "verbosity": "high", "webSearch": true, }');
  await workspace.write(Destination.PROJECT, '{"verbosity":null}');

  // Act
  const loaded = await loadConfiguration(workspace.paths, {
    projectTrusted: true,
    environment: { PI_OPENAI_SERVICE_TIER: "fast" },
  });
  const result = resolveSettings(loaded);

  // Assert
  expect(result.values).toEqual(settings({ verbosity: null, webSearch: true, serviceTier: ServiceTier.PRIORITY }));
  expect(result.sources.verbosity).toBe("project");
  expect(result.sources.webSearch).toBe("global");
  expect(result.sources.serviceTier).toBe("environment");
});

it("uses defaults and selects global when no configuration exists", async () => {
  // Act
  const loaded = await loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} });

  // Assert
  expect(resolveSettings(loaded).values).toEqual(settings());
  await expect(defaultDestination(workspace.paths, { projectTrusted: true })).resolves.toBe("global");
});

it.each([Destination.GLOBAL, Destination.PROJECT] as const)(
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
  await workspace.write(Destination.PROJECT, source);

  // Act / Assert
  await expect(loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} })).rejects.toThrow(
    "Invalid project configuration",
  );
});

it("does not hide invalid environment settings behind disabled config", async () => {
  // Arrange
  await workspace.write(Destination.PROJECT, '{"enabled":false}');

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
  await workspace.write(Destination.GLOBAL, "{}");

  // Act / Assert
  await expect(defaultDestination(workspace.paths, { projectTrusted: true })).resolves.toBe("global");
  await workspace.write(Destination.PROJECT, "{}");
  await expect(defaultDestination(workspace.paths, { projectTrusted: true })).resolves.toBe("project");
});

it.each([Destination.GLOBAL, Destination.PROJECT] as const)(
  "creates %s configuration and missing parent directories",
  async (destination) => {
    // Arrange
    const values = settings({
      verbosity: Verbosity.LOW,
      reasoningSummary: ReasoningSummary.NONE,
      allowUnsupported: true,
    });
    await rm(destination === "global" ? workspace.agentDir : workspace.cwd, { recursive: true });

    // Act
    await saveConfiguration(workspace.paths, destination, [{ match: {}, settings: values }], { projectTrusted: true });

    // Assert
    expect(parseConfig(await workspace.read(destination))).toEqual(values);
    expect((await stat(workspace.paths[destination])).mode & 0o777).toBe(0o600);
  },
);

it("preserves comments, unknown keys, line endings and saved nulls", async () => {
  // Arrange
  const original = '{\r\n  // keep this\r\n  "verbosity": "high", // inline\r\n  "future": {"nested":42},\r\n}\r\n';
  await workspace.write(Destination.PROJECT, original);
  const values = settings({ reasoningSummary: ReasoningSummary.NONE, serviceTier: ServiceTier.PRIORITY });

  // Act
  await saveConfiguration(workspace.paths, Destination.PROJECT, [{ match: {}, settings: values }], {
    projectTrusted: true,
  });
  const source = await workspace.read(Destination.PROJECT);

  // Assert
  expect(source).toContain("// keep this");
  expect(source).toContain("// inline");
  expect(source.replaceAll("\r\n", "")).not.toContain("\n");
  expect(parseConfig(source)).toEqual({ ...values, future: { nested: 42 } });
  expect(await readdir(workspace.cwd + "/.pi")).toEqual(["pi-openai.jsonc"]);
});

it("refuses to overwrite malformed configuration", async () => {
  // Arrange
  await workspace.write(Destination.PROJECT, "{invalid");

  // Act / Assert
  await expect(
    saveConfiguration(workspace.paths, Destination.PROJECT, [{ match: {}, settings: settings() }], {
      projectTrusted: true,
    }),
  ).rejects.toThrow("Invalid project configuration");
  expect(await workspace.read(Destination.PROJECT)).toBe("{invalid");
});

it("reports unreadable save targets without creating temporary files", async () => {
  // Arrange
  const paths = { ...workspace.paths, project: workspace.agentDir + "/block/config.jsonc" };
  await workspace.write(Destination.GLOBAL, "{}");
  await mkdir(paths.project, { recursive: true });

  // Act / Assert
  await expect(
    saveConfiguration(paths, Destination.PROJECT, [{ match: {}, settings: settings() }], { projectTrusted: true }),
  ).rejects.toThrow("Could not read project configuration");
  expect(await readdir(workspace.agentDir + "/block")).toEqual(["config.jsonc"]);
});

it("rejects duplicate setting keys instead of saving a misleading effective value", async () => {
  // Arrange
  const source = '{"verbosity":"high", "verbosity":"low"}';
  await workspace.write(Destination.PROJECT, source);

  // Act / Assert
  await expect(loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} })).rejects.toThrow(
    "Duplicate setting: verbosity",
  );
  await expect(
    saveConfiguration(workspace.paths, Destination.PROJECT, [{ match: {}, settings: settings() }], {
      projectTrusted: true,
    }),
  ).rejects.toThrow("Duplicate setting: verbosity");
  expect(await workspace.read(Destination.PROJECT)).toBe(source);
});

it("uses a custom warning reporter instead of UI notifications", async () => {
  // Arrange
  await workspace.write(Destination.PROJECT, '{"verbosty":"high"}');
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
  await workspace.write(Destination.GLOBAL, '{"verbosity":"high","webSearch":true}');
  if (kind === "unreadable") {
    await mkdir(workspace.paths.project);
  } else {
    await workspace.write(Destination.PROJECT, kind === "valid" ? '{"verbosity":"low","unknown":true}' : "{invalid");
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
  expect(resolveSettings(loaded).values).toEqual(settings({ verbosity: Verbosity.MEDIUM, webSearch: true }));
  expect(read.mock.calls).toEqual([[workspace.paths.global]]);
  expect(onWarning).not.toHaveBeenCalled();
});

it("uses defaults when untrusted and only project configuration exists", async () => {
  // Arrange
  await workspace.write(Destination.PROJECT, '{"verbosity":"high"}');

  // Act
  const loaded = await loadConfiguration(workspace.paths, { projectTrusted: false, environment: {} });

  // Assert
  expect(loaded.project).toEqual({});
  expect(resolveSettings(loaded).values).toEqual(settings());
});

it("selects global without inspecting project configuration when untrusted", async () => {
  // Arrange
  await workspace.write(Destination.PROJECT, "{}");
  const inspect = vi.fn(() => workspace.paths.project);
  const paths = {
    global: workspace.paths.global,
    get project() {
      return inspect();
    },
  };

  // Act
  const destination = await defaultDestination(paths, { projectTrusted: false });

  // Assert
  expect(destination).toBe("global");
  expect(inspect).not.toHaveBeenCalled();
});

it("rejects untrusted project saves before accessing the target", async () => {
  // Arrange
  await workspace.write(Destination.PROJECT, "{invalid");
  const read = vi.spyOn(files, "readOptionalFile");
  const target = vi.fn(() => workspace.paths.project);
  const paths = {
    global: workspace.paths.global,
    get project() {
      return target();
    },
  };

  // Act / Assert
  await expect(
    saveConfiguration(paths, Destination.PROJECT, [{ match: {}, settings: settings() }], { projectTrusted: false }),
  ).rejects.toThrow("Project is not trusted; refusing to save project configuration.");
  expect(read).not.toHaveBeenCalled();
  expect(target).not.toHaveBeenCalled();
  expect(await workspace.read(Destination.PROJECT)).toBe("{invalid");
});

it("allows global saves while untrusted without touching project configuration", async () => {
  // Arrange
  await workspace.write(Destination.PROJECT, "{invalid");
  const values = settings({ verbosity: Verbosity.HIGH });

  // Act
  await saveConfiguration(workspace.paths, Destination.GLOBAL, [{ match: {}, settings: values }], {
    projectTrusted: false,
  });

  // Assert
  expect(parseConfig(await workspace.read(Destination.GLOBAL))).toEqual(values);
  expect(await workspace.read(Destination.PROJECT)).toBe("{invalid");
});

it("loads scoped rules and warns contextually without broadening misspelled selectors", async () => {
  // Arrange
  const onWarning = vi.fn();
  await workspace.write(
    Destination.GLOBAL,
    JSON.stringify({
      overrides: [
        {
          match: { model: "gpt-6-sol" },
          settings: { serviceTier: "fast", verbosty: "low" },
          future: 42,
        },
      ],
    }),
  );

  // Act
  const loaded = await loadConfiguration(workspace.paths, { projectTrusted: true, environment: {}, onWarning });

  // Assert
  expect(loaded.global.overrides).toEqual([
    {
      match: { model: "gpt-6-sol" },
      settings: { serviceTier: "priority" },
    },
  ]);
  expect(onWarning).toHaveBeenCalledWith(
    expect.stringContaining('overrides[0]: Unknown configuration entries: "verbosty"'),
  );
  expect(onWarning).toHaveBeenCalledWith(
    expect.stringContaining('overrides[0]: Unknown configuration entries: "future"'),
  );
});

it.each([
  '{"overrides":null}',
  '{"overrides":{}}',
  '{"overrides":[null]}',
  '{"overrides":[{"match":{},"settings":{}}]}',
  '{"overrides":[{"match":{"model":""},"settings":{}}]}',
  '{"overrides":[{"match":{"modle":"x"},"settings":{}}]}',
  '{"overrides":[{"match":{"model":"x"},"settings":[]}]}',
  '{"overrides":[{"match":{"model":"nonmatching"},"settings":{"verbosity":"invalid"}}]}',
  '{"overrides":[],"overrides":[]}',
  '{"overrides":[{"match":{"model":"x"},"match":{"model":"y"},"settings":{}}]}',
  '{"overrides":[{"match":{"model":"x","model":"y"},"settings":{}}]}',
  '{"overrides":[{"match":{"model":"x"},"settings":{},"settings":{}}]}',
  '{"overrides":[{"match":{"model":"x"},"settings":{"verbosity":"low","verbosity":"high"}}]}',
  '{"overrides":[{"match":{"model":"x","provider":"p"},"settings":{}},{"match":{"provider":"p","model":"x"},"settings":{}}]}',
])("rejects invalid scoped configuration on load and save: %s", async (source) => {
  // Arrange
  await workspace.write(Destination.PROJECT, source);
  const patches = [{ match: {}, settings: { webSearch: true } }];

  // Act / Assert
  await expect(loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} })).rejects.toThrow(
    "Invalid project configuration",
  );
  await expect(
    saveConfiguration(workspace.paths, Destination.PROJECT, patches, { projectTrusted: true }),
  ).rejects.toThrow("Invalid project configuration");
  expect(await workspace.read(Destination.PROJECT)).toBe(source);
});

it("patches existing selectors without losing comments, other rules, or unrelated settings", async () => {
  // Arrange
  const source = `{
  // Defaults remain inherited.
  "verbosity": "high",
  "future": {"value": 42},
  "overrides": [
    {"match": {"model": "gpt-6-sol", "provider": "openai"}, "settings": {
      // Retain summary.
      "reasoningSummary": "auto",
      "verbosity": "high",
      "futureSetting": 42
    }},
    {"match": {"api": "other"}, "settings": {"webSearch": true}}
  ]
}\n`;
  await workspace.write(Destination.PROJECT, source.replaceAll("\n", "\r\n"));

  // Act
  await saveConfiguration(
    workspace.paths,
    Destination.PROJECT,
    [
      { match: { provider: "openai", model: "gpt-6-sol" }, settings: { verbosity: null } },
      { match: { api: "openai-responses" }, settings: { serviceTier: ServiceTier.PRIORITY } },
    ],
    { projectTrusted: true },
  );
  const saved = await workspace.read(Destination.PROJECT);

  // Assert
  expect(saved).toContain("// Retain summary.");
  expect(saved).toContain("// Defaults remain inherited.");
  expect(saved.replaceAll("\r\n", "")).not.toContain("\n");
  expect(parseConfig(saved)).toEqual({
    verbosity: "high",
    future: { value: 42 },
    overrides: [
      {
        match: { model: "gpt-6-sol", provider: "openai" },
        settings: { reasoningSummary: "auto", verbosity: null, futureSetting: 42 },
      },
      { match: { api: "other" }, settings: { webSearch: true } },
      { match: { api: "openai-responses" }, settings: { serviceTier: "priority" } },
    ],
  });
});

it("creates scoped files and rereads external edits on subsequent saves", async () => {
  // Arrange
  const match = { provider: "__proto__", model: "a/b" };

  // Act
  await saveConfiguration(workspace.paths, Destination.GLOBAL, [{ match, settings: { verbosity: Verbosity.LOW } }], {
    projectTrusted: true,
  });
  await workspace.write(
    Destination.GLOBAL,
    (await workspace.read(Destination.GLOBAL)).replace('"verbosity": "low"', '"verbosity": "low", "webSearch": true'),
  );
  await saveConfiguration(workspace.paths, Destination.GLOBAL, [{ match, settings: { reasoningSummary: null } }], {
    projectTrusted: true,
  });

  // Assert
  expect(parseConfig(await workspace.read(Destination.GLOBAL))).toEqual({
    overrides: [{ match, settings: { verbosity: "low", webSearch: true, reasoningSummary: null } }],
  });
  expect((await stat(workspace.paths.global)).mode & 0o777).toBe(0o600);
});

it("does not touch files when there are no patches", async () => {
  // Act
  await saveConfiguration(workspace.paths, Destination.GLOBAL, [], { projectTrusted: true });

  // Assert
  await expect(workspace.read(Destination.GLOBAL)).rejects.toHaveProperty("code", "ENOENT");
});

it("preserves existing permissions even when the process umask is more restrictive", async () => {
  // Arrange
  await workspace.write(Destination.GLOBAL, '{"verbosity":"high"}');
  await filesystem.chmod(workspace.paths.global, 0o660);

  // Act
  await saveConfiguration(
    workspace.paths,
    Destination.GLOBAL,
    [{ match: {}, settings: { verbosity: Verbosity.LOW } }],
    {
      projectTrusted: true,
    },
  );

  // Assert
  expect((await stat(workspace.paths.global)).mode & 0o777).toBe(0o660);
});

it("keeps the original file and removes temporary files if atomic replacement fails", async () => {
  // Arrange
  const source = '{ // retain\n "verbosity": "high" }';
  await workspace.write(Destination.GLOBAL, source);
  vi.mocked(filesystem.rename).mockRejectedValueOnce(new Error("rename failed"));

  // Act / Assert
  await expect(
    saveConfiguration(
      workspace.paths,
      Destination.GLOBAL,
      [{ match: { model: "gpt-6-sol" }, settings: { verbosity: Verbosity.LOW } }],
      {
        projectTrusted: true,
      },
    ),
  ).rejects.toThrow("Could not save global configuration.");
  expect(await workspace.read(Destination.GLOBAL)).toBe(source);
  expect(await readdir(workspace.agentDir)).toEqual(["pi-openai.jsonc"]);
});

it("removes top-level settings while preserving unrelated data and explicit null values", async () => {
  // Arrange
  const source =
    '{\r\n  "verbosity": "high",\r\n  // Keep summary.\r\n  "reasoningSummary": null,\r\n  "future": 42\r\n}\r\n';
  await workspace.write(Destination.GLOBAL, source);

  // Act
  await saveConfiguration(
    workspace.paths,
    Destination.GLOBAL,
    [{ match: {}, settings: {}, unset: [Setting.VERBOSITY] }],
    {
      projectTrusted: true,
    },
  );
  const saved = await workspace.read(Destination.GLOBAL);

  // Assert
  expect(parseConfig(saved)).toEqual({ reasoningSummary: null, future: 42 });
  expect(saved).toBe(source.replace('  "verbosity": "high",\r\n', ""));
  expect(saved.replaceAll("\r\n", "")).not.toContain("\n");
});

it("removes empty override blocks and handles shifted indexes across mixed patches", async () => {
  // Arrange
  await workspace.write(
    Destination.PROJECT,
    JSON.stringify({
      verbosity: "high",
      overrides: [
        { match: { model: "first" }, settings: { verbosity: "low" } },
        { match: { model: "second" }, settings: { verbosity: "low", webSearch: true } },
        { match: { model: "third" }, settings: { verbosity: "low" } },
      ],
    }),
  );

  // Act
  await saveConfiguration(
    workspace.paths,
    Destination.PROJECT,
    [
      { match: { model: "first" }, settings: {}, unset: [Setting.VERBOSITY] },
      { match: { model: "second" }, settings: { reasoningSummary: null }, unset: [Setting.VERBOSITY] },
      { match: { model: "third" }, settings: {}, unset: [Setting.VERBOSITY] },
      { match: { model: "fourth" }, settings: { webSearch: true } },
    ],
    { projectTrusted: true },
  );

  // Assert
  expect(parseConfig(await workspace.read(Destination.PROJECT))).toEqual({
    verbosity: "high",
    overrides: [
      { match: { model: "second" }, settings: { webSearch: true, reasoningSummary: null } },
      { match: { model: "fourth" }, settings: { webSearch: true } },
    ],
  });
});

it("removes the overrides property when its final rule becomes empty", async () => {
  // Arrange
  await workspace.write(
    Destination.GLOBAL,
    JSON.stringify({
      verbosity: "high",
      overrides: [{ match: { model: model.id }, settings: { verbosity: null } }],
    }),
  );

  // Act
  await saveConfiguration(
    workspace.paths,
    Destination.GLOBAL,
    [{ match: { model: model.id }, settings: {}, unset: [Setting.VERBOSITY] }],
    { projectTrusted: true },
  );

  // Assert
  expect(parseConfig(await workspace.read(Destination.GLOBAL))).toEqual({ verbosity: "high" });
});

it.each([{ settings: { verbosity: "low", future: 42 } }, { settings: { verbosity: "low" }, future: 42 }])(
  "preserves unknown override data when removing the last known setting: %j",
  async (extra) => {
    // Arrange
    const match = { model: model.id };
    await workspace.write(Destination.GLOBAL, JSON.stringify({ overrides: [{ match, ...extra }] }));

    // Act
    await saveConfiguration(
      workspace.paths,
      Destination.GLOBAL,
      [{ match, settings: {}, unset: [Setting.VERBOSITY] }],
      {
        projectTrusted: true,
      },
    );

    // Assert
    const remaining = { ...extra.settings };
    Reflect.deleteProperty(remaining, "verbosity");
    expect(parseConfig(await workspace.read(Destination.GLOBAL))).toEqual({
      overrides: [{ match, ...extra, settings: remaining }],
    });
  },
);

it.each([{}, { model: "absent" }])(
  "does not create files or scopes when unsetting missing entries at %j",
  async (match) => {
    // Act / Assert
    const patches = [{ match, settings: {}, unset: ["verbosity" as const] }];
    await saveConfiguration(workspace.paths, Destination.GLOBAL, patches, { projectTrusted: true });
    await expect(workspace.read(Destination.GLOBAL)).rejects.toHaveProperty("code", "ENOENT");
    const source = '{ // Keep formatting.\n "webSearch": true\n}\n';
    await workspace.write(Destination.GLOBAL, source);
    await saveConfiguration(workspace.paths, Destination.GLOBAL, patches, { projectTrusted: true });
    expect(await workspace.read(Destination.GLOBAL)).toBe(source);
  },
);

it("preserves settings added externally before a removal is saved", async () => {
  // Arrange
  const match = { model: model.id };
  await workspace.write(Destination.GLOBAL, JSON.stringify({ overrides: [{ match, settings: { verbosity: "low" } }] }));
  await loadConfiguration(workspace.paths, { projectTrusted: true, environment: {} });
  await workspace.write(
    Destination.GLOBAL,
    JSON.stringify({
      overrides: [{ match, settings: { verbosity: "low", webSearch: true } }],
    }),
  );

  // Act
  await saveConfiguration(workspace.paths, Destination.GLOBAL, [{ match, settings: {}, unset: [Setting.VERBOSITY] }], {
    projectTrusted: true,
  });

  // Assert
  expect(parseConfig(await workspace.read(Destination.GLOBAL))).toEqual({
    overrides: [{ match, settings: { webSearch: true } }],
  });
});

it.each([
  '{"verbosity":null}',
  '{"verbosity":null,}',
  '{"verbosity":null,"webSearch":true}',
  '{"webSearch":true,"verbosity":null}',
  '{"webSearch":true,"verbosity":null,}',
  '{"webSearch":true,/* keep */"verbosity":null,"enabled":false}',
  '{"verbosity":null,/* keep */"webSearch":true}',
  '{"webSearch":true,/* keep */"verbosity":null/* keep */,}',
])("removes JSONC entries without damaging surrounding commas or comments: %s", async (source) => {
  // Arrange
  await workspace.write(Destination.GLOBAL, source);
  const expected = parseConfig(source);
  Reflect.deleteProperty(expected, "verbosity");

  // Act
  await saveConfiguration(
    workspace.paths,
    Destination.GLOBAL,
    [{ match: {}, settings: {}, unset: [Setting.VERBOSITY] }],
    {
      projectTrusted: true,
    },
  );
  const saved = await workspace.read(Destination.GLOBAL);

  // Assert
  expect(parseConfig(saved)).toEqual(expected);
  expect(saved.match(/\/\* keep \*\//g)).toEqual(source.match(/\/\* keep \*\//g));
});

it("keeps comments for neighboring rules when deleting an override with trailing commas", async () => {
  // Arrange
  await workspace.write(
    Destination.GLOBAL,
    `{
  "overrides": [
    {"match": {"model": "first"}, "settings": {"verbosity": "low",}},
    // Keep the other rule.
    {"match": {"model": "second"}, "settings": {"verbosity": "high",}},
  ],
}`,
  );

  // Act
  await saveConfiguration(
    workspace.paths,
    Destination.GLOBAL,
    [{ match: { model: "first" }, settings: {}, unset: [Setting.VERBOSITY] }],
    { projectTrusted: true },
  );
  const saved = await workspace.read(Destination.GLOBAL);

  // Assert
  expect(saved).toContain("// Keep the other rule.");
  expect(parseConfig(saved)).toEqual({
    overrides: [{ match: { model: "second" }, settings: { verbosity: "high" } }],
  });
});
