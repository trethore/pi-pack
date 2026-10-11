import { agentLoop, type AgentTool } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream, type AssistantMessage, type Model } from "@earendil-works/pi-ai";
import { convertToLlm } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { createCodemodeToolDefinition } from "#src/tool";
import type { CodemodeToolDetails } from "#src/types";
import { harness, outcome } from "#test/support/harness";

const model: Model<"openai-responses"> = {
  id: "test",
  name: "test",
  api: "openai-responses",
  provider: "test",
  baseUrl: "https://example.invalid",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8192,
  maxTokens: 2048,
};

function toolCallStream(code: string) {
  const message: AssistantMessage = {
    role: "assistant",
    content: [
      { type: "toolCall", id: "first", name: "codemode", arguments: { code } },
      { type: "toolCall", id: "second", name: "codemode", arguments: { code } },
    ],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: 0,
  };
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "done", reason: "toolUse", message });
  return stream;
}

it("serializes codemode invocations even when Pi defaults to parallel execution", async () => {
  // Arrange
  const test = harness();
  const definition = createCodemodeToolDefinition(test.options);
  const tool: AgentTool<typeof definition.parameters, CodemodeToolDetails | undefined> = {
    ...definition,
    execute: (id, params, signal, update) => definition.execute(id, params, signal, update, test.context),
  };
  const code = 'const next = (load("counter") ?? 0) + 1; await tools.echo({}); store("counter", next); return next;';
  const order: string[] = [];

  // Act
  const stream = agentLoop(
    [{ role: "user", content: "Run both scripts", timestamp: 0 }],
    { messages: [], tools: [tool] },
    { model, convertToLlm, toolExecution: "parallel", finishTurn: () => ({ action: "end" }) },
    undefined,
    () => toolCallStream(code),
  );
  for await (const event of stream) {
    if (event.type === "tool_execution_start" || event.type === "tool_execution_end") {
      order.push(`${event.type}:${event.toolCallId}`);
    }
  }
  const stored = await test.run('return load("counter")');

  // Assert
  expect(order).toEqual([
    "tool_execution_start:first",
    "tool_execution_end:first",
    "tool_execution_start:second",
    "tool_execution_end:second",
  ]);
  expect(test.appendEntry).toHaveBeenCalledTimes(2);
  expect(stored.content.slice(1)).toEqual([{ type: "text", text: "2" }]);
});

it.each(["all", "allSettled"])("keeps nested calls parallel with Promise.%s", async (method) => {
  // Arrange
  const test = harness();
  const definition = createCodemodeToolDefinition(test.options);
  const bothStarted = Promise.withResolvers<void>();
  let started = 0;
  test.executeTool.mockImplementation(async (name) => {
    const value = String(++started);
    if (started === 2) {
      bothStarted.resolve();
    }
    await bothStarted.promise;
    return outcome(name, { content: [{ type: "text", text: value }], details: undefined });
  });
  const code = `// @options: {"timeout_ms": 2000}
    return await Promise.${method}([tools.echo({}), tools.echo({})]);`;

  // Act
  const result = await definition.execute("parallel", { code }, undefined, undefined, test.context);

  // Assert
  expect(definition.executionMode).toBe("sequential");
  expect(result.isError).toBeUndefined();
  expect(started).toBe(2);
  expect(result.details?.calls).toMatchObject([{ status: "ok" }, { status: "ok" }]);
  const values =
    method === "all"
      ? ["1", "2"]
      : [
          { status: "fulfilled", value: "1" },
          { status: "fulfilled", value: "2" },
        ];
  expect(result.content.slice(1)).toEqual([{ type: "text", text: JSON.stringify(values) }]);
});
