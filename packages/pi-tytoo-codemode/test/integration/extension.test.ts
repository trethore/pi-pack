import { harness, resultText } from "#test/support/harness";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCodemodeExtension, DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

it("loads TypeScript directly and replaces builtin codemode through Pi's public loader", async () => {
  // Arrange
  const root = await mkdtemp(join(tmpdir(), "tytoo-loader-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir,
    settingsManager: SettingsManager.inMemory(),
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    extensionFactories: [{ name: "codemode", factory: createCodemodeExtension(), builtin: true, replaceable: true }],
    additionalExtensionPaths: [fileURLToPath(new URL("../../src/index.ts", import.meta.url))],
  });
  try {
    // Act
    await loader.reload();
    const loaded = loader.getExtensions();
    loaded.runtime.getAllTools = () => [];
    const owners = loaded.extensions.filter((extension) => extension.tools.has("codemode"));
    // Assert
    expect(loaded.errors).toEqual([]);
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
    expect(resultText(result)).toContain("2");
    expect(owners[0]?.path).toContain("pi-tytoo-codemode");
    expect(owners[0]?.tools.get("codemode")?.definition).toMatchObject({
      exposure: "model-only",
      defaultActive: false,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
