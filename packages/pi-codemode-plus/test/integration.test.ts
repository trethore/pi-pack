import {
  createCodemodeExtension,
  type ExtensionAPI,
  type ExtensionToolContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { defaultConfig } from "#src/config";
import { wrapRenderers } from "#src/renderers";
import { renderResult } from "#test/render-harness";

it("formats actual sandbox output without changing model-facing content", async () => {
  // Arrange
  let tool: ToolDefinition | undefined;
  await createCodemodeExtension()({
    registerTool(definition: ToolDefinition) {
      tool = definition;
    },
    getAllTools: () => [],
    appendEntry: () => {},
  } as unknown as ExtensionAPI);
  if (!tool) {
    throw new Error("Missing codemode tool");
  }
  const context = {
    tools: [],
    sessionManager: { getBranch: () => [] },
  } as unknown as ExtensionToolContext;

  // Act
  const result = await tool.execute(
    "integration",
    {
      code: `
text({ user: { name: "Alice", age: 25, active: true } });
console.log("unchanged console output");
return { message: "Hello!\\nGoodbye!" };
`,
    },
    undefined,
    undefined,
    context,
  );
  const before = structuredClone(result);
  const display = renderResult(
    wrapRenderers(tool, () => defaultConfig),
    result,
  );

  // Assert
  expect(result.isError).not.toBe(true);
  expect(display).toContain("==> text 1/2 <==\nuser.name: Alice\nuser.age: 25\nuser.active: true");
  expect(display).toContain('==> text 2/2 <==\nmessage: """\nHello!\nGoodbye!\n"""');
  expect(display).toContain("<console_output>\nunchanged console output\n</console_output>");
  expect(result).toEqual(before);
  const modelText = result.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  expect(modelText).toContain('{"user":{"name":"Alice","age":25,"active":true}}');
});
