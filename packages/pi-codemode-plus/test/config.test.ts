import { expect, it, vi } from "vitest";
import { defaultConfig, loadConfig } from "#src/config";
import { useWorkspace } from "#test/workspace";

const workspace = useWorkspace();

function load(projectTrusted = true, onWarning = vi.fn()) {
  return loadConfig(workspace.cwd, { projectTrusted, agentDir: workspace.agentDir, onWarning });
}

it("enables all features by default", async () => {
  // Act / Assert
  await expect(load()).resolves.toEqual({
    enabled: true,
    hideHeader: true,
    prettyPrintOutput: true,
    showFullScript: true,
  });
});

it("accepts JSONC comments and trailing commas", async () => {
  // Arrange
  await workspace.configure(
    '{ // settings\n "hideHeader": false, "prettyPrintOutput": false, "showFullScript": false, }',
    true,
  );

  // Act / Assert
  await expect(load()).resolves.toEqual({
    enabled: true,
    hideHeader: false,
    prettyPrintOutput: false,
    showFullScript: false,
  });
});

it("uses project configuration instead of merging with global configuration", async () => {
  // Arrange
  await workspace.configure('{"hideHeader":false,"prettyPrintOutput":false,"showFullScript":false}', true);
  await workspace.configure('{"enabled":false}');

  // Act / Assert
  await expect(load()).resolves.toEqual({ ...defaultConfig, enabled: false });
});

it.each(["enabled", "hideHeader", "prettyPrintOutput", "showFullScript"])("requires a boolean for %s", async (key) => {
  // Arrange
  await workspace.configure(JSON.stringify({ [key]: "true" }));

  // Act / Assert
  await expect(load()).rejects.toThrow(`${key} must be a boolean`);
});

it.each(["null", "[]", "{invalid"])("rejects invalid configuration without global fallback: %s", async (source) => {
  // Arrange
  await workspace.configure(source);
  await workspace.configure("{}", true);

  // Act / Assert
  await expect(load()).rejects.toThrow("pi-codemode-plus: invalid configuration");
});

it("warns about unknown settings while honoring known settings", async () => {
  // Arrange
  await workspace.configure('{"showFullScript":false,"visibleScript":true}');
  const warn = vi.fn();

  // Act
  const config = await load(true, warn);

  // Assert
  expect(config.showFullScript).toBe(false);
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('Unknown configuration entries: "visibleScript"'),
  );
});

it("does not read untrusted project configuration", async () => {
  // Arrange
  await workspace.configure("{invalid");
  await workspace.configure('{"enabled":false}', true);

  // Act / Assert
  await expect(load(false)).resolves.toEqual({ ...defaultConfig, enabled: false });
});
