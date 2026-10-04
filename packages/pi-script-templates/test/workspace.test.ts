import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { getWorkspace } from "#src/workspace";
import { countingScript, useWorkspace } from "#test/workspace";

const files = useWorkspace();

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
