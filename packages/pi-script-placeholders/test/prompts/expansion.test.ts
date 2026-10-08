import { expect, it } from "vitest";
import { Scope } from "#src/constants";
import { createHarness } from "#test/harness";
import { countingScript, useWorkspace } from "#test/workspace";

const files = useWorkspace();

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

it.each([Scope.GLOBAL, Scope.PROJECT] as const)(
  "expands loaded %s prompt templates, including RPC input",
  async (scope) => {
    // Arrange
    await files.script("platform", countingScript("resolved"));
    const command = await files.prompt("environment", "{{platform}}", scope);
    const extension = createHarness(files.cwd, [command]);

    // Act / Assert
    expect(await extension.input("/environment", "rpc")).toEqual({ action: "transform", text: "resolved" });
  },
);

it("does not expand untrusted project prompt templates", async () => {
  // Arrange
  await files.script("platform", countingScript("unexpected"), Scope.GLOBAL);
  const command = await files.prompt("environment", "{{platform}}", Scope.PROJECT);
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
