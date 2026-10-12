import { harness } from "#test/support/harness";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCodemodeExtension, DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

function expectBuiltinWarnings(
  warnings: readonly { path: string; warning: string }[] | undefined,
  builtinEnabled: boolean,
): void {
  const entries = warnings ?? [];
  expect(entries).toHaveLength(builtinEnabled ? 1 : 0);
  if (builtinEnabled) {
    expect(entries[0]?.path).toBe("builtin:codemode");
    expect(entries[0]?.warning).toContain("was not loaded");
  }
}

it.each([true, false])("loads the package with builtin codemode enabled: %s", async (builtinEnabled) => {
  // Arrange
  const root = await mkdtemp(join(tmpdir(), "tytoo-loader-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir,
    settingsManager: SettingsManager.inMemory({
      packages: [packageRoot],
      extensions: builtinEnabled ? [] : ["-builtin:codemode"],
    }),
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    extensionFactories: [{ name: "codemode", factory: createCodemodeExtension(), builtin: true, replaceable: true }],
  });
  try {
    // Act
    await loader.reload();
    const loaded = loader.getExtensions();
    loaded.runtime.getAllTools = () => [];
    const owners = loaded.extensions.filter((extension) => extension.tools.has("codemode"));

    // Assert
    expect(loaded.errors).toEqual([]);
    expectBuiltinWarnings(loaded.warnings, builtinEnabled);
    expect(owners).toHaveLength(1);
    const definition = owners[0]?.tools.get("codemode")?.definition;
    if (!definition) {
      throw new Error("Missing loaded tool");
    }
    const result = await definition.execute(
      "loaded",
      { code: "return 1 + 1" },
      undefined,
      undefined,
      harness().context,
    );
    expect(result.isError).not.toBe(true);
    expect(result.content.slice(1)).toEqual([{ type: "text", text: "2" }]);
    expect(owners[0]?.path).toContain("pi-tytoo-codemode");
    expect(owners[0]?.tools.get("codemode")?.definition).toMatchObject({
      exposure: "model-only",
      executionMode: "sequential",
      defaultActive: false,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
