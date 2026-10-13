import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Usage } from "@earendil-works/pi-ai";
import * as modelHelpers from "#src/models";
import { Type } from "typebox";
import { harness, outcome, resultText, sampleTool } from "#test/support/harness";

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Pi execution", () => {
  it("routes nested calls through Pi and publishes independent snapshots", async () => {
    // Arrange
    const tool = sampleTool();
    const test = harness([tool]);

    // Act
    const result = await test.run("return await tools.echo({ value: 42 })");

    // Assert
    expect(test.executeTool.mock.calls[0]?.slice(0, 2)).toEqual(["echo", { value: 42 }]);
    expect(test.executeTool.mock.calls[0]?.[2]?.signal).toBeInstanceOf(AbortSignal);
    expect(tool.execute).not.toHaveBeenCalled();
    expect(resultText(result)).toContain('{"value":42}');
    expect(result.details.calls).toMatchObject([{ id: "script/echo", status: "ok" }]);
    expect(test.onUpdate.mock.calls[0]?.[0].details.calls).toEqual([]);
    expect(test.onUpdate.mock.calls[1]?.[0].details.calls[0]?.status).toBe("running");
  });

  it("rejects blocked nested calls without executing tool implementations", async () => {
    // Arrange
    const tool = sampleTool();
    const test = harness([tool]);
    test.executeTool.mockResolvedValue(
      outcome("echo", { content: [{ type: "text", text: "Permission denied" }], details: undefined }, true),
    );

    // Act
    const result = await test.run("await tools.echo({})");

    // Assert
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Permission denied");
    expect(tool.execute).not.toHaveBeenCalled();
    expect(result.details.calls[0]?.status).toBe("error");
  });

  it("preserves structured MCP error results for script inspection", async () => {
    // Arrange
    const tool = { ...sampleTool(), outputSchema: Type.Object({}) };
    const test = harness([tool]);
    test.executeTool.mockResolvedValue(
      outcome("echo", { content: [], details: undefined, structuredContent: { content: [], isError: true } }, true),
    );

    // Act
    const result = await test.run("return (await tools.echo({})).isError");

    // Assert
    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain("true");
  });

  it("does not expose codemode or tools outside the callable snapshot", async () => {
    // Arrange
    const test = harness([sampleTool("codemode"), sampleTool("echo")]);

    // Act
    const result = await test.run("return [Object.keys(tools), ALL_TOOLS.map(x => x.name)]");

    // Assert
    expect(resultText(result)).toContain('[["echo"],["echo"]]');
    expect(test.executeTool).not.toHaveBeenCalled();
  });

  it("cancels pending calls when the script returns", async () => {
    // Arrange
    const test = harness();
    let nestedSignal: AbortSignal | undefined;
    test.executeTool.mockImplementation((_name, _args, options) => {
      nestedSignal = options?.signal;
      return new Promise(() => {});
    });

    // Act
    const result = await test.run("tools.echo({}); return 'finished'");

    // Assert
    expect(nestedSignal?.aborted).toBe(true);
    expect(result.details.calls[0]?.status).toBe("cancelled");
  });

  it.each([
    { label: "thrown error", code: 'throw new Error("failed");', error: "Error: failed" },
    { label: "oversized return", code: 'return "x".repeat(16777217);', error: "RangeError: Script output exceeded" },
    {
      label: "combined output limit",
      code: 'return "x".repeat(16777216);',
      error: "RangeError: Script output exceeded",
    },
  ])("discards state writes without undoing a completed file write on $label", async ({ code, error }) => {
    // Arrange
    const directory = await mkdtemp(join(tmpdir(), "codemode-rollback-"));
    directories.push(directory);
    const path = join(directory, "written.txt");
    const test = harness([sampleTool("write")]);
    await test.run('store("key", "before")');
    test.appendEntry.mockClear();
    test.executeTool.mockImplementation(async () => {
      await writeFile(path, "completed action");
      return outcome("write", { content: [{ type: "text", text: "Written" }], details: undefined });
    });

    // Act
    const failed = await test.run(`store("key", "after"); await tools.write({}); text("partial"); ${code}`);
    const stored = await test.run('return load("key")');

    // Assert
    expect(failed.isError).toBe(true);
    expect(resultText(failed)).toContain("partial");
    expect(resultText(failed)).toContain(error);
    expect(failed.details.calls).toMatchObject([{ name: "write", status: "ok" }]);
    expect(test.appendEntry).not.toHaveBeenCalled();
    expect(stored.content.slice(1)).toEqual([{ type: "text", text: "before" }]);
    expect(await readFile(path, "utf8")).toBe("completed action");
  });

  it.each([false, true])("checks returned shell failures explicitly (throw=%s)", async (throwOnFailure) => {
    // Arrange
    const tool = {
      ...sampleTool("bash"),
      outputSchema: Type.Object({ exit_code: Type.Number(), output: Type.String() }),
    };
    const test = harness([tool]);
    test.executeTool.mockResolvedValue(
      outcome(
        "bash",
        {
          content: [{ type: "text", text: "Command exited with code 7" }],
          structuredContent: { exit_code: 7, output: "failed" },
          isError: true,
          details: undefined,
        },
        true,
      ),
    );
    const check = throwOnFailure ? 'if (result.exit_code !== 0) throw new Error("Command failed");' : "";

    // Act
    const result = await test.run(`
      store("key", "pending");
      const result = await tools.bash({});
      text({ exit_code: result.exit_code, hasIsError: "isError" in result });
      ${check}
    `);
    const stored = await test.run('return load("key") ?? null');

    // Assert
    expect(resultText(result)).toContain('{"exit_code":7,"hasIsError":false}');
    expect(result.details.calls).toMatchObject([{ name: "bash", status: "error" }]);
    expect(result.isError).toBe(throwOnFailure ? true : undefined);
    expect(test.appendEntry).toHaveBeenCalledTimes(throwOnFailure ? 0 : 1);
    expect(stored.content.slice(1)).toEqual([{ type: "text", text: throwOnFailure ? "null" : "pending" }]);
  });

  it("collects usage and image counts from model globals", async () => {
    // Arrange
    const test = harness([], { models: true });
    const usage: Usage = {
      input: 10,
      output: 20,
      cacheRead: 3,
      cacheWrite: 4,
      cacheWrite1h: 2,
      reasoning: 5,
      totalTokens: 37,
      cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
    };
    vi.spyOn(modelHelpers, "createModelGlobals").mockImplementation(
      (_models, _toolCallId, _calls, _publish, addUsage, addGeneratedImages) => [
        {
          name: "models.generateImages",
          execute: () => {
            addUsage(usage);
            addGeneratedImages(1);
          },
        },
      ],
    );

    // Act
    const result = await test.run("await models.generateImages(); await models.generateImages();");

    // Assert
    expect(result.isError).toBeUndefined();
    expect(result.usage).toEqual({
      input: 20,
      output: 40,
      cacheRead: 6,
      cacheWrite: 8,
      cacheWrite1h: 4,
      reasoning: 10,
      totalTokens: 74,
      cost: { input: 2, output: 4, cacheRead: 6, cacheWrite: 8, total: 20 },
    });
    expect(resultText(result)).toContain("returned 2 images, but the script showed none.");
    expect(result.content.some((item) => item.type === "image")).toBe(false);
  });

  it("spills full text without losing the bounded response", async () => {
    // Arrange
    const test = harness();

    // Act
    const result = await test.run('// @options: {"max_output_tokens": 4}\ntext("x".repeat(1000))');
    const path = result.details.fullOutputPath;
    if (!path) {
      throw new Error("Expected output file");
    }
    directories.push(dirname(path));

    // Assert
    const fullText = await readFile(path, "utf8");
    const response = resultText(result);
    expect(fullText).toBe("x".repeat(1000));
    expect(response).toContain("truncated output");
    expect(response.length).toBeLessThan(fullText.length);
    expect(response).toContain("xxxxxxxx...about 246 tokens removed...xxxxxxxx");
    expect(response).not.toContain("x".repeat(9));
  });
});

it("rejects misplaced options before any script effects or progress updates", async () => {
  // Arrange
  const test = harness();

  // Act / Assert
  await expect(test.run('await tools.echo({});\n// @options: {"timeout_ms": 1}\nstore("k", 1);')).rejects.toThrow(
    "first line",
  );
  expect(test.executeTool).not.toHaveBeenCalled();
  expect(test.appendEntry).not.toHaveBeenCalled();
  expect(test.onUpdate).not.toHaveBeenCalled();
});

it.each([null, 42, "error", ["first", "second"]])(
  "preserves non-object structured MCP content: %j",
  async (structuredContent) => {
    // Arrange
    const tool = { ...sampleTool(), outputSchema: Type.Unknown() };
    const test = harness([tool]);
    test.executeTool.mockResolvedValue(outcome("echo", { content: [], details: undefined, structuredContent }, true));

    // Act
    const result = await test.run("return { value: await tools.echo({}) };");

    // Assert
    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain(JSON.stringify({ value: structuredContent }));
  },
);
