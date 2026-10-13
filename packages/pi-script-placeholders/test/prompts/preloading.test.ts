import { rm } from "node:fs/promises";
import type { SessionStartEvent, SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { Scope } from "#src/constants";
import { createHarness } from "#test/harness";
import { countingScript, useWorkspace } from "#test/workspace";

const files = useWorkspace();

it.each(["new", "resume", "fork"] satisfies Array<SessionStartEvent["reason"]>)(
  "preserves preloaded template bodies across %s without executing scripts",
  async (reason) => {
    // Arrange
    await files.script("platform", countingScript("linux"));
    const command = await files.prompt("environment", "Original: {{platform}}");
    const first = createHarness(files.cwd, [command]);
    await first.start();
    await files.prompt("environment", "Changed: {{platform}}");
    const replacement = createHarness(files.cwd, [command]);

    // Act
    await replacement.start(reason);
    const runsBeforeInvocation = await files.runs();
    const result = await replacement.input("/environment");

    // Assert
    expect(runsBeforeInvocation).toBe("");
    expect(result).toEqual({ action: "transform", text: "Original: linux" });
    expect(await files.runs()).toBe("x");
  },
);

it("loads templates added after session start on first invocation", async () => {
  // Arrange
  await files.script("platform", countingScript("linux"));
  const commands: SlashCommandInfo[] = [];
  const extension = createHarness(files.cwd, commands);
  await extension.start();
  commands.push(await files.prompt("late", "Late: {{platform}}"));

  // Act
  const result = await extension.input("/late");

  // Assert
  expect(result).toEqual({ action: "transform", text: "Late: linux" });
  expect(await files.runs()).toBe("x");
});

it("preloads global templates but not untrusted project templates or non-prompt commands", async () => {
  // Arrange
  await files.script("platform", countingScript("linux"), Scope.GLOBAL);
  const global = await files.prompt("global", "{{platform}}");
  const project = await files.prompt("project", "{{platform}}", Scope.PROJECT);
  const extensionCommand = {
    ...(await files.prompt("extension", "{{platform}}")),
    source: "extension",
  } as const;
  const skillCommand = {
    ...(await files.prompt("skill", "{{platform}}")),
    source: "skill",
  } as const;
  const extension = createHarness(files.cwd, [global, project, extensionCommand, skillCommand], false);

  // Act
  await extension.start();
  const workspace = await files.load(false);

  // Assert
  expect([...workspace.prompts.keys()]).toEqual([global.sourceInfo.path]);
  expect(await files.runs()).toBe("");
  expect(extension.notify).not.toHaveBeenCalled();
});

it.each([{ enabled: false }, { surfaces: { promptTemplates: false } }])(
  "does not preload templates when disabled by %j",
  async (config) => {
    // Arrange
    await files.configure(config);
    const command = await files.prompt("environment", "{{platform}}");
    await rm(command.sourceInfo.path);
    const extension = createHarness(files.cwd, [command]);

    // Act
    await extension.start();
    const workspace = await files.load();

    // Assert
    expect(workspace.prompts.size).toBe(0);
    expect(extension.notify).not.toHaveBeenCalled();
  },
);

it("caches preload failures until reload and reports them once", async () => {
  // Arrange
  await files.script("platform", countingScript("linux"));
  const command = await files.prompt("environment", "{{platform}}");
  await rm(command.sourceInfo.path);
  const extension = createHarness(files.cwd, [command]);

  // Act
  await extension.start();
  const warningsAtStart = extension.notify.mock.calls.length;
  await files.prompt("environment", "{{platform}}");
  const beforeReload = await extension.input("/environment");
  const runsBeforeReload = await files.runs();
  await extension.start("reload");
  const afterReload = await extension.input("/environment");

  // Assert
  expect(warningsAtStart).toBe(1);
  expect(extension.notify).toHaveBeenCalledTimes(1);
  expect(beforeReload).toEqual({ action: "continue" });
  expect(runsBeforeReload).toBe("");
  expect(afterReload).toEqual({ action: "transform", text: "linux" });
  expect(await files.runs()).toBe("x");
});
