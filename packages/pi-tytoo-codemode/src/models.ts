import { argumentsArray } from "#src/sandbox/values";
import type { AnyModel, ClassifierContext, ImagesContext, ModelType, ModelTypeMap, Usage } from "@earendil-works/pi-ai";
import type { CodemodeTool } from "#src/sandbox/types";
import { CODEMODE_DOCS_PATH } from "#src/constants";
import { type CodemodeModelRuntime, type CodemodeNestedCall } from "#src/types";
import { truncateText } from "#src/values";
const MAX_CONCURRENT_MODEL_CALLS = 4;
const ERROR_PREVIEW_CHARS = 500;
const MODEL_TYPES: ReadonlySet<ModelType> = new Set<ModelType>(["chat", "image", "classifier"]);
function toModelType(value: unknown): ModelType {
  if (value === "chat" || value === "image" || value === "classifier") {
    return value;
  }
  throw new Error(`Unknown model type ${JSON.stringify(value)}. Use "chat", "image", or "classifier".`);
}

function toProvider(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("provider must be a string");
  }
  return value;
}

/** Catalog entry for scripts. `headers` is dropped because models.json headers can carry credentials. */
function toModelInfo(model: AnyModel): Record<string, unknown> {
  const info: Record<string, unknown> = { ...model };
  delete info.headers;
  return info;
}

/** `an image`, `a classifier`. */
function withArticle(word: string): string {
  return `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A script value in an error message: `undefined`, `a string`, `an array`, or its keys (`{ prompt }`). */
function describeValue(value: unknown): string {
  if (value === undefined || value === null) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "an empty array" : "an array";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return "{}";
    }
    return `{ ${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", ..." : ""} }`;
  }
  return typeof value === "string" ? "a string" : `a ${typeof value}`;
}

const CLASSIFIER_CONTEXT_SHAPE =
  '{ state: { ... }, images?: [{ type: "image", data: <base64>, mimeType }], questions: { <id>: { type: "choice", instructions, criteria: { <label>: <meaning> } } | { type: "score", instructions, criteria: [<lowest level>, ..., <highest level>] } | { type: "bool", instructions, criteria: { true: <meaning>, false: <meaning> } } } }';

/** Check a script's classifier context, so mistakes fail with the expected shape instead of a provider error. */
function assertClassifierContext(context: unknown): asserts context is ClassifierContext {
  if (!isRecord(context)) {
    throw classifierError(`expects a context object as its second argument, got ${describeValue(context)}`);
  }
  if (!isRecord(context.state)) {
    throw classifierError(`context.state must be an object, got ${describeValue(context.state)}`);
  }
  const { images } = context;
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      throw classifierError(`context.images must be an array, got ${describeValue(images)}`);
    }
    images.forEach((image: unknown, index) => {
      if (
        !isRecord(image) ||
        image.type !== "image" ||
        typeof image.data !== "string" ||
        typeof image.mimeType !== "string"
      ) {
        throw classifierError(`context.images[${index}] must be an image block, got ${describeValue(image)}`);
      }
    });
  }
  const { questions } = context;
  if (!isRecord(questions) || Object.keys(questions).length === 0) {
    throw classifierError(`context.questions must map question IDs to questions, got ${describeValue(questions)}`);
  }

  for (const [id, question] of Object.entries(questions)) {
    checkQuestion(id, question);
  }
}

/** Check a script's image context, so mistakes such as `{ prompt }` fail with the expected shape. */
function assertImagesContext(context: unknown): asserts context is ImagesContext {
  if (!isRecord(context)) {
    throw imagesError(`expects a context object as its second argument, got ${describeValue(context)}`);
  }
  const { input } = context;
  if (!Array.isArray(input) || input.length === 0) {
    throw imagesError(`context.input must be a non-empty array of blocks, got ${describeValue(input)}`);
  }
  input.forEach((block: unknown, index) => {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      return;
    }
    if (
      isRecord(block) &&
      block.type === "image" &&
      typeof block.data === "string" &&
      typeof block.mimeType === "string"
    ) {
      return;
    }
    throw imagesError(`context.input[${index}] must be a text or image block, got ${describeValue(block)}`);
  });
}

/** The fields of `ClassifierResult` and `AssistantImages` that a nested call row reports. */
interface ModelCallResult {
  stopReason: "stop" | "error" | "aborted";
  errorMessage?: string;
  usage?: Usage;
}

/** Runs at most `limit` calls at once, in call order. */
function createLimiter(limit: number): <T>(run: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (run) => {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;
    try {
      return await run();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

export function createModelGlobals(
  models: CodemodeModelRuntime,
  toolCallId: string,
  calls: CodemodeNestedCall[],
  publish: () => void,
  addUsage: (usage: Usage) => void,
  addGeneratedImages: (count: number) => void,
): CodemodeTool[] {
  const limit = createLimiter(MAX_CONCURRENT_MODEL_CALLS);
  let callCount = 0;

  /**
   * Resolve the script's model by provider and id only, check the context, then run the call as a
   * nested call row. A script-supplied baseUrl or headers must never receive the credentials.
   */
  const runModelCall = async <TType extends "classifier" | "image", TContext, TResult extends ModelCallResult>(
    name: string,
    type: TType,
    [model, context]: unknown[],
    signal: AbortSignal,
    checkContext: (context: unknown) => TContext,
    run: (resolved: ModelTypeMap[TType], context: TContext) => Promise<TResult>,
  ): Promise<TResult> => {
    const resolved = resolveModel(models, name, type, model);
    const checked = checkContext(context);

    const record: CodemodeNestedCall = {
      id: `${toolCallId}/${name}/${++callCount}`,
      name,
      args: `${resolved.provider}/${resolved.id}`,
      status: "running",
    };
    calls.push(record);
    publish();
    const startedAt = performance.now();
    let result: TResult;
    try {
      result = await limit(() => {
        signal.throwIfAborted();
        return run(resolved, checked);
      });
    } catch (error) {
      record.durationMs = performance.now() - startedAt;
      record.status = signal.aborted ? "cancelled" : "error";
      record.error = truncateText(error instanceof Error ? error.message : String(error), ERROR_PREVIEW_CHARS);
      publish();
      throw error;
    }
    record.durationMs = performance.now() - startedAt;
    record.status = result.stopReason === "stop" ? "ok" : result.stopReason === "aborted" ? "cancelled" : "error";
    if (result.errorMessage) {
      record.error = truncateText(result.errorMessage, ERROR_PREVIEW_CHARS);
    }
    if (result.usage) {
      record.cost = result.usage.cost.total;
      addUsage(result.usage);
    }
    publish();
    return result;
  };
  const implementations: Record<string, CodemodeTool["execute"]> = {
    "models.getModelsOfType": (args) => {
      const [type, provider] = argumentsArray(args);
      return models.getModelsOfType(toModelType(type), toProvider(provider)).map(toModelInfo);
    },
    "models.getAvailableOfType": async (args, { signal }) => {
      const [type, provider] = argumentsArray(args);
      const available = await models.getAvailableOfType(toModelType(type), toProvider(provider), { signal });
      return available.map(toModelInfo);
    },
    "models.getModelOfType": (args) => {
      const [type, provider, id] = argumentsArray(args);
      if (typeof provider !== "string" || typeof id !== "string") {
        throw new Error(
          `models.getModelOfType(type, provider, id) expects three strings, got (${argumentsArray(args).map(describeValue).join(", ")}). The provider and the id are separate arguments, for example models.getModelOfType("classifier", "typesafe", "jev-latest").`,
        );
      }
      const model = models.getModelOfType(toModelType(type), provider, id);
      return model === undefined ? undefined : toModelInfo(model);
    },
    "models.classify": (args, { signal }) =>
      runModelCall(
        "models.classify",
        "classifier",
        argumentsArray(args),
        signal,
        checkClassifierContext,
        (resolved, context) => models.classify(resolved, context, { signal }),
      ),
    "models.generateImages": (args, { signal }) =>
      runModelCall(
        "models.generateImages",
        "image",
        argumentsArray(args),
        signal,
        checkImagesContext,
        async (resolved, context) => {
          const result = await models.generateImages(resolved, context, { signal });
          addGeneratedImages(result.output.filter((block) => block.type === "image").length);
          return result;
        },
      ),
  };
  return Object.entries(implementations).map(([name, execute]) => ({ name, spread: true, execute }));
}

function checkClassifierContext(context: unknown): ClassifierContext {
  assertClassifierContext(context);
  return context;
}
function checkImagesContext(context: unknown): ImagesContext {
  assertImagesContext(context);
  return context;
}

const classifierError = (problem: string) =>
  new Error(
    `models.classify() ${problem}. Expected context: ${CLASSIFIER_CONTEXT_SHAPE}. See "Classify" in ${CODEMODE_DOCS_PATH}.`,
  );

const imagesError = (problem: string) =>
  new Error(
    `models.generateImages() ${problem}. Expected context: { input: [{ type: "text", text: <prompt> }, ...optional { type: "image", data: <base64>, mimeType } references] }. See "Generate images" in ${CODEMODE_DOCS_PATH}.`,
  );

const isStrings = (values: unknown[]) => values.length > 0 && values.every((value) => typeof value === "string");

function checkQuestion(id: string, question: unknown): void {
  const at = `context.questions.${id}`;
  if (!isRecord(question)) {
    throw classifierError(`${at} must be a question object, got ${describeValue(question)}`);
  }
  if (typeof question.instructions !== "string") {
    throw classifierError(`${at}.instructions must be a string`);
  }
  const { criteria } = question;
  if (question.type === "choice") {
    if (!isRecord(criteria) || !isStrings(Object.values(criteria))) {
      throw classifierError(`${at} is a "choice" question, so criteria must map each label to its meaning`);
    }
  } else if (question.type === "score") {
    if (!isScoreCriteria(criteria)) {
      throw classifierError(`${at} is a "score" question, so criteria must list the levels as strings, lowest first`);
    }
  } else if (question.type === "bool") {
    if (!isBooleanCriteria(criteria)) {
      throw classifierError(`${at} is a "bool" question, so criteria must be { true: string, false: string }`);
    }
  } else {
    throw classifierError(`${at}.type must be "choice", "score", or "bool", got ${JSON.stringify(question.type)}`);
  }
}

function resolveModel<TType extends "classifier" | "image">(
  models: CodemodeModelRuntime,
  name: string,
  type: TType,
  model: unknown,
): ModelTypeMap[TType] {
  const listHint = `List the ${type} models you can use with models.getAvailableOfType("${type}").`;
  if (!isRecord(model) || typeof model.provider !== "string" || typeof model.id !== "string") {
    // undefined arrives as null: spread arguments cross the sandbox as a JSON array.
    const undefinedHint =
      model === undefined || model === null
        ? " models.getModelOfType() returns undefined for an unknown provider or id."
        : "";
    throw new Error(
      `${name}() expects ${withArticle(type)} model as its first argument, got ${describeValue(model)}.${undefinedHint} ${listHint}`,
    );
  }
  const { provider, id } = model;
  const ref = `${provider}/${id}`;
  const resolved = models.getModelOfType(type, provider, id);
  if (!resolved) {
    const actualType = [...MODEL_TYPES].find(
      (other) => other !== type && models.getModelOfType(other, provider, id) !== undefined,
    );
    throw new Error(
      actualType
        ? `"${ref}" is ${withArticle(actualType)} model, not ${withArticle(type)} model. ${listHint}`
        : `Unknown ${type} model "${ref}". ${listHint}`,
    );
  }
  return resolved;
}

function isBooleanCriteria(value: unknown): boolean {
  return isRecord(value) && typeof value.true === "string" && typeof value.false === "string";
}

function isScoreCriteria(value: unknown): boolean {
  return Array.isArray(value) && isStrings(value);
}
