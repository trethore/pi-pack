import { readFile } from "node:fs/promises";
import type { SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import type { ScriptPlaceholdersConfig } from "#src/config";
import { Scope } from "#src/constants";
import { createHarness } from "#test/harness";
import { countingScript, useWorkspace } from "#test/workspace";

const files = useWorkspace();

it("shares results across system, append system, and prompt-template surfaces", async () => {
  // Arrange
  await files.script("platform", countingScript("stable"));
  const command = await files.prompt("environment", "---\ndescription: Environment\n---\n{{platform}} $1");
  const extension = createHarness(files.cwd, [command]);
  await extension.start();

  // Act
  const prompt = await extension.input('/environment "first argument"');
  const first = await extension.system();
  const second = await extension.system();

  // Assert
  expect(prompt).toEqual({ action: "transform", text: "stable first argument" });
  expect(first.customPrompt).toBe("stable");
  expect(first.appendSystemPrompt).toBe("stable");
  expect(second).toEqual(first);
  expect(first.contextFiles[0]?.content).toBe("{{platform}}");
  expect(first.sections.other).toBe("{{platform}}");
  expect(await files.runs()).toBe("x");
  expect(await readFile(command.sourceInfo.path, "utf8")).toContain("{{platform}} $1");
});

it.each(["new", "resume", "fork"] satisfies Array<SessionStartEvent["reason"]>)(
  "retains cached output and configuration across %s, including new extension instances",
  async (reason) => {
    // Arrange
    await files.script("platform", countingScript("initial"));
    const first = createHarness(files.cwd);
    await first.start();
    await first.system();
    await files.script("platform", countingScript("changed"));
    await files.configure({ enabled: false });
    const replacement = createHarness(files.cwd);

    // Act
    await replacement.start(reason);
    const options = await replacement.system();

    // Assert
    expect(options.customPrompt).toBe("initial");
    expect(await files.runs()).toBe("x");
  },
);

it("reload clears cached outputs, failures, prompt bodies, and configuration", async () => {
  // Arrange
  await files.script("platform", countingScript("old"));
  const command = await files.prompt("environment", "Before {{platform}} {{missing}}");
  const extension = createHarness(files.cwd, [command]);
  await extension.start();
  await extension.input("/environment");
  await files.script("platform", countingScript("new"));
  await files.script("missing", countingScript("found"));
  await files.prompt("environment", "After {{platform}} {{missing}}");
  await files.configure({ surfaces: { appendSystem: false } });

  // Act
  await extension.start("reload");
  const prompt = await extension.input("/environment");
  const options = await extension.system();

  // Assert
  expect(prompt).toEqual({ action: "transform", text: "After new found" });
  expect(options.customPrompt).toBe("new");
  expect(options.appendSystemPrompt).toBe("{{platform}}");
  expect(await files.runs()).toBe("xxx");
});

it.each(["system", "appendSystem", "promptTemplates"] satisfies Array<keyof ScriptPlaceholdersConfig["surfaces"]>)(
  "can disable the %s surface independently",
  async (surface) => {
    // Arrange
    await files.configure({ surfaces: { [surface]: false } });
    await files.script("platform", countingScript("resolved"));
    const command = await files.prompt("environment", "{{platform}}");
    const extension = createHarness(files.cwd, [command]);
    await extension.start();

    // Act
    const prompt = await extension.input("/environment");
    const options = await extension.system();

    // Assert
    expect(options.customPrompt).toBe(surface === "system" ? "{{platform}}" : "resolved");
    expect(options.appendSystemPrompt).toBe(surface === "appendSystem" ? "{{platform}}" : "resolved");
    expect(prompt).toEqual(
      surface === "promptTemplates" ? { action: "continue" } : { action: "transform", text: "resolved" },
    );
    expect(await files.runs()).toBe("x");
  },
);

it("does not execute anything when all surfaces are disabled", async () => {
  // Arrange
  await files.configure({ surfaces: { system: false, appendSystem: false, promptTemplates: false } });
  await files.script("platform", countingScript("unexpected"));
  const command = await files.prompt("environment", "{{platform}}");
  const extension = createHarness(files.cwd, [command]);

  // Act
  await extension.start();
  await extension.system();
  await extension.input("/environment");

  // Assert
  expect(await files.runs()).toBe("");
});

it("warns about a failure once per reload, including after session replacement", async () => {
  // Arrange
  const first = createHarness(files.cwd);
  await first.system("{{missing}}", "");
  const replacement = createHarness(files.cwd);

  // Act
  await replacement.start("new");
  await replacement.system("{{missing}}", "");
  await replacement.start("reload");
  await replacement.system("{{missing}}", "");

  // Assert
  expect(first.notify).toHaveBeenCalledTimes(1);
  expect(replacement.notify).toHaveBeenCalledTimes(1);
  expect(first.notify).toHaveBeenCalledWith(
    'pi-script-placeholders: No script found for "missing"; placeholder left unchanged.',
    "warning",
  );
});

it("uses a new cache entry if trust changes without reusing privileged project output", async () => {
  // Arrange
  await files.script("platform", countingScript("project"));
  await files.script("platform", countingScript("global"), Scope.GLOBAL);
  const trusted = createHarness(files.cwd);
  await trusted.system();

  // Act
  const untrusted = createHarness(files.cwd, [], false);
  const options = await untrusted.system();

  // Assert
  expect(options.customPrompt).toBe("global");
});

it("does not invalidate output when inherited environment values change", async () => {
  // Arrange
  vi.stubEnv("PI_SCRIPT_PLACEHOLDERS_TEST", "initial");
  await files.script("platform", "process.stdout.write(process.env.PI_SCRIPT_PLACEHOLDERS_TEST);");
  const extension = createHarness(files.cwd);
  await extension.system();
  vi.stubEnv("PI_SCRIPT_PLACEHOLDERS_TEST", "changed");

  // Act / Assert
  expect((await extension.system()).customPrompt).toBe("initial");
});
