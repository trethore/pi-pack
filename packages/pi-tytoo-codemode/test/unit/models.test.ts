import { describe, expect, it, vi } from "vitest";
import type { ClassifierContext, ImageContent, ModelType, ModelTypeMap } from "@earendil-works/pi-ai";
import { createModelGlobals } from "#src/models";
import type { CodemodeModelRuntime, CodemodeNestedCall } from "#src/types";

const context: ClassifierContext = {
  state: {},
  questions: { valid: { type: "bool", instructions: "Check validity", criteria: { true: "valid", false: "invalid" } } },
};

const invalidImages = [
  { name: "null", value: null },
  { name: "an array", value: [] },
  { name: "the wrong block type", value: { type: "text", data: "aGVsbG8=", mimeType: "image/png" } },
  { name: "missing data", value: { type: "image", mimeType: "image/png" } },
  { name: "non-string data", value: { type: "image", data: 42, mimeType: "image/png" } },
  { name: "missing MIME type", value: { type: "image", data: "aGVsbG8=" } },
  { name: "non-string MIME type", value: { type: "image", data: "aGVsbG8=", mimeType: 42 } },
];

function setup() {
  const model: ModelTypeMap["classifier"] = {
    provider: "test",
    id: "classifier",
    type: "classifier",
    name: "Test classifier",
    api: "typesafe-system-one",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    baseUrl: "https://trusted.invalid",
    headers: { Authorization: "secret" },
  };

  const imageModel: ModelTypeMap["image"] = {
    ...model,
    id: "image",
    name: "Test image model",
    type: "image",
    api: "openrouter-images",
    output: ["image"],
  };

  const classify = vi.fn<CodemodeModelRuntime["classify"]>().mockResolvedValue({
    api: model.api,
    provider: model.provider,
    model: model.id,
    answers: { valid: { type: "bool", probability: 1 } },
    stopReason: "stop",
    timestamp: 0,
  });
  const generateImages = vi.fn<CodemodeModelRuntime["generateImages"]>().mockResolvedValue({
    api: imageModel.api,
    provider: imageModel.provider,
    model: imageModel.id,
    output: [],
    stopReason: "stop",
    timestamp: 0,
  });
  const catalog: { [Type in ModelType]: readonly ModelTypeMap[Type][] } = {
    chat: [],
    image: [imageModel],
    classifier: [model],
  };
  const registry = {
    getModelsOfType: (type, provider) => catalog[type].filter((entry) => !provider || entry.provider === provider),
    getAvailableOfType: async (type, provider) =>
      catalog[type].filter((entry) => !provider || entry.provider === provider),
    getModelOfType: (type, provider, id) =>
      catalog[type].find((entry) => entry.provider === provider && entry.id === id),
    classify,
    generateImages,
  } satisfies CodemodeModelRuntime;

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

  return { model, imageModel, classify, generateImages, calls, invoke };
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

  it("accepts image blocks for classification and image generation", async () => {
    // Arrange
    const test = setup();
    const image: ImageContent = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };
    const classifierContext = { ...context, images: [image] };
    const imagesContext = { input: [{ type: "text", text: "Describe this image" }, image] };

    // Act
    await test.invoke("classify", [test.model, classifierContext]);
    await test.invoke("generateImages", [test.imageModel, imagesContext]);

    // Assert
    expect(test.classify).toHaveBeenCalledTimes(1);
    expect(test.classify.mock.calls[0]?.[1]).toEqual(classifierContext);
    expect(test.generateImages).toHaveBeenCalledTimes(1);
    expect(test.generateImages.mock.calls[0]?.[1]).toEqual(imagesContext);
  });

  it.each(invalidImages)("rejects $name in classifier images", async ({ value }) => {
    // Arrange
    const test = setup();

    // Act / Assert
    await expect(test.invoke("classify", [test.model, { ...context, images: [value] }])).rejects.toThrow(
      "context.images[0] must be an image block",
    );
    expect(test.classify).not.toHaveBeenCalled();
  });

  it.each(invalidImages)("rejects $name in image generation input", async ({ value }) => {
    // Arrange
    const test = setup();

    // Act / Assert
    await expect(test.invoke("generateImages", [test.imageModel, { input: [value] }])).rejects.toThrow(
      "context.input[0] must be a text or image block",
    );
    expect(test.generateImages).not.toHaveBeenCalled();
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
