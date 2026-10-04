import { expect, it } from "vitest";
import { createHarness } from "#test/harness";
import { countingScript, useWorkspace } from "#test/workspace";

const files = useWorkspace();

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
