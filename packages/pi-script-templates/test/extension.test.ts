import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
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

it.each(["new", "resume", "fork"])(
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

it.each(["system", "appendSystem", "promptTemplates"])("can disable the %s surface independently", async (surface) => {
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
});

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

it("does not expand ordinary input, unknown commands, skills, or extension commands", async () => {
  // Arrange
  await files.script("platform", countingScript("unexpected"));
  const prompt = await files.prompt("environment", "{{platform}}");
  const extension = createHarness(files.cwd, [
    { ...prompt, source: "extension" },
    prompt,
    { ...prompt, name: "skill:environment", source: "skill" },
  ]);

  // Act / Assert
  for (const text of ["{{platform}}", "/missing", "/environment", "/skill:environment", " /environment"]) {
    expect(await extension.input(text)).toEqual({ action: "continue" });
  }
  expect(await files.runs()).toBe("");
});

it.each(["global", "project"] as const)("expands loaded %s prompt templates, including RPC input", async (scope) => {
  // Arrange
  await files.script("platform", countingScript("resolved"));
  const command = await files.prompt("environment", "{{platform}}", scope);
  const extension = createHarness(files.cwd, [command]);

  // Act / Assert
  expect(await extension.input("/environment", "rpc")).toEqual({ action: "transform", text: "resolved" });
});

it("does not expand untrusted project prompt templates", async () => {
  // Arrange
  await files.script("platform", countingScript("unexpected"), "global");
  const command = await files.prompt("environment", "{{platform}}", "project");
  const extension = createHarness(files.cwd, [command], false);

  // Act / Assert
  expect(await extension.input("/environment")).toEqual({ action: "continue" });
  expect(await files.runs()).toBe("");
});

it("leaves native argument expansion alone for prompts without script placeholders", async () => {
  // Arrange
  const command = await files.prompt("native", "$1 $ARGUMENTS");
  const extension = createHarness(files.cwd, [command]);

  // Act / Assert
  expect(await extension.input("/native argument")).toEqual({ action: "continue" });
});

it("does not expand placeholders supplied as arguments or reinterpret script output as arguments", async () => {
  // Arrange
  await files.script("platform", countingScript("$1 {{other}}"));
  await files.script("other", countingScript("unexpected"));
  const command = await files.prompt("environment", "{{platform}} / $1");
  const extension = createHarness(files.cwd, [command]);

  // Act / Assert
  expect(await extension.input("/environment {{other}}")).toEqual({
    action: "transform",
    text: "$1 {{other}} / {{other}}",
  });
  expect(await files.runs()).toBe("x");
});

it("preserves prompt argument defaults, quoted values, slices, and nonrecursive substitution", async () => {
  // Arrange
  await files.script("platform", "process.stdout.write('OS');");
  const command = await files.prompt(
    "environment",
    "{{platform}} | $1 | $2 | $3 | $@ | $ARGUMENTS | ${4:-fallback} | ${@:2:1} | ${@:0}",
  );
  const extension = createHarness(files.cwd, [command]);

  // Act
  const result = await extension.input("/environment \"first argument\" '$1' last");

  // Assert
  expect(result).toEqual({
    action: "transform",
    text: "OS | first argument | $1 | last | first argument $1 last | first argument $1 last | fallback | $1 | first argument $1 last",
  });
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
    'pi-script-templates: No script found for "missing"; placeholder left unchanged.',
    "warning",
  );
});

it("uses a new cache entry if trust changes without reusing privileged project output", async () => {
  // Arrange
  await files.script("platform", countingScript("project"));
  await files.script("platform", countingScript("global"), "global");
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
  vi.stubEnv("PI_SCRIPT_TEMPLATES_TEST", "initial");
  await files.script("platform", "process.stdout.write(process.env.PI_SCRIPT_TEMPLATES_TEST);");
  const extension = createHarness(files.cwd);
  await extension.system();
  vi.stubEnv("PI_SCRIPT_TEMPLATES_TEST", "changed");

  // Act / Assert
  expect((await extension.system()).customPrompt).toBe("initial");
});

it.each([
  ["/environment", "linux", "x"],
  ["/environment override", "override", ""],
  ["/environment {{other}}", "{{other}}", ""],
])("handles script placeholders inside argument defaults: %s", async (input, expected, runs) => {
  // Arrange
  await files.script("platform", countingScript("linux"));
  await files.script("other", countingScript("unexpected"));
  const command = await files.prompt("environment", "${1:-{{platform}}}");
  const extension = createHarness(files.cwd, [command]);

  // Act
  const result = await extension.input(input);

  // Assert
  expect(result).toEqual({ action: "transform", text: expected });
  expect(await files.runs()).toBe(runs);
});
