import { describe, expect, it, vi } from "vitest";
import { createModelGlobals } from "#src/models";
import type { CodemodeModelRuntime, CodemodeNestedCall } from "#src/types";

const context = {
  state: {},
  questions: { valid: { type: "bool", instructions: "Check validity", criteria: { true: "valid", false: "invalid" } } },
};
function setup() {
  const model = {
    provider: "test",
    id: "classifier",
    type: "classifier",
    baseUrl: "https://trusted.invalid",
    headers: { Authorization: "secret" },
  };
  const classify = vi.fn(async (_model: unknown, _context: unknown, _options: unknown) => ({ stopReason: "stop" }));
  const registry = {
    getModelsOfType: () => [model],
    getAvailableOfType: async () => [model],
    getModelOfType: () => model,
    classify,
    generateImages: vi.fn(),
  } as unknown as CodemodeModelRuntime;
  const calls: CodemodeNestedCall[] = [];
  const globals = createModelGlobals(
    registry,
    "script",
    calls,
    () => {},
    () => {},
    () => {},
  );
  const invoke = async (name: string, args: unknown[], signal = new AbortController().signal) => {
    const tool = globals.find((entry) => entry.name === `models.${name}`);
    if (!tool) {
      throw new Error(`Missing global: ${name}`);
    }
    return await tool.execute(args, { signal });
  };
  return { model, classify, calls, invoke };
}

describe("model helpers", () => {
  it("does not disclose registry headers", async () => {
    // Arrange
    const test = setup();
    // Act
    const listed = await test.invoke("getModelsOfType", ["classifier"]);
    const available = await test.invoke("getAvailableOfType", ["classifier"]);
    const single = await test.invoke("getModelOfType", ["classifier", "test", "classifier"]);
    // Assert
    for (const result of [listed, available, single]) {
      expect(JSON.stringify(result)).not.toContain("secret");
    }
  });

  it("resolves models in the registry rather than trusting script-provided endpoints", async () => {
    // Arrange
    const test = setup();
    const forged = {
      provider: "test",
      id: "classifier",
      baseUrl: "https://untrusted.invalid",
      headers: { Authorization: "other" },
    };
    // Act
    await test.invoke("classify", [forged, context]);
    // Assert
    expect(test.classify.mock.calls[0]?.[0]).toBe(test.model);
    expect(test.calls[0]?.status).toBe("ok");
  });

  it("rejects invalid contexts before calling providers", async () => {
    // Arrange
    const test = setup();
    // Act / Assert
    await expect(test.invoke("classify", [test.model, { state: {}, questions: {} }])).rejects.toThrow("questions");
    expect(test.classify).not.toHaveBeenCalled();
  });

  it("records thrown provider failures as errors", async () => {
    // Arrange
    const test = setup();
    test.classify.mockRejectedValue(new Error("provider failed"));
    // Act / Assert
    await expect(test.invoke("classify", [test.model, context])).rejects.toThrow("provider failed");
    expect(test.calls[0]).toMatchObject({ status: "error", error: "provider failed" });
  });

  it("does not start provider calls after cancellation", async () => {
    // Arrange
    const test = setup();
    const abort = new AbortController();
    abort.abort();
    // Act / Assert
    await expect(test.invoke("classify", [test.model, context], abort.signal)).rejects.toThrow();
    expect(test.classify).not.toHaveBeenCalled();
    expect(test.calls[0]?.status).toBe("cancelled");
  });
});
