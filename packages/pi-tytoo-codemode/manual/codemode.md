# Codemode

The `codemode` tool lets the model write a JavaScript script that calls pi's other tools and runs classifiers and image-generation models.
Only the script's output reaches the model, so a script can run calls in parallel and filter large results before the model sees them.
To turn it on, see [Installation](../README.md#installation).

## Scripts

With grammar-based tool input, pass raw JavaScript source, not JSON or a markdown code fence. Otherwise, the tool accepts `{ code: string }`. The source runs as the body of an async function in a QuickJS sandbox, so top-level `await` and `return` work.
The sandbox has no Node APIs, file system, network, or timers; scripts reach the outside world only through tools and `models`.

Pi runs separate `codemode` calls one at a time. Within a script, independent tool calls can run in parallel; calls that depend on earlier results must run in order.

A script may start with an options line. It must be the first line; an options line anywhere else fails the call before the script runs:

```js
// @options: {"max_output_tokens": 2000, "timeout_ms": 60000}
```

- `max_output_tokens` (default 10000) sets an estimated text budget, at four characters per token. It must be a non-negative safe integer. Longer output keeps its start and end, and the full text is written to a temp file whose path is included in the result.
  Images, the result header, and truncation and image-save notices are not counted toward this budget. Separately, a script fails when its output exceeds 16777216 characters of text and base64 image data or 100000 output items. `text()`, `image()`, and `console` calls share these hard limits with the top-level return value. A displayed return value counts as one item, even if it is an empty string; `undefined` produces no item. Returned strings count their displayed characters, not JSON quotes and escapes. A limit failure discards stored-state writes. Write large data to a file with a tool instead.
- `timeout_ms` is a hard deadline for the whole script, including tool calls. It must be a positive integer no greater than 2147483647 and is unset by default. Image generation can take minutes, so do not set a short deadline for scripts that generate images.

The model-facing result starts with `Script completed` or `Script failed`, the wall time, and the output. Text and image items appear in order, each on its own line, unless the text is truncated; then the text is combined and images follow it. When the output has more than one text item (from `text()` or `return`), each starts with a `==> text N/M <==` line. `console` calls follow in one `<console_output>` block, separated by newlines.
A failed script keeps its partial output, followed by `Script error:` and the error. Tool calls are real: calls made before a failure are not undone. Calls still running when the script ends receive an abort signal, and unawaited promises are discarded. Whether a call stops depends on the tool, so await every call whose result you need.

In the terminal, the extension shows the code without a `codemode` heading and hides the result header. The tool row shows `Elapsed` while running and `Took` when finished. By default, `prettyResults` formats JSON output as indented objects and lists with triple-quoted multiline strings. This changes only what the user sees, not the model-facing output. Set it to `false` to keep raw JSON rendering; see [Configuration](../README.md#configuration).

If saving full text or an image to a temp file fails, the result includes the save error instead of a path. The save failure does not make an otherwise successful script fail.

## Globals

| Global                                       | Purpose                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools.<name>(args)`                         | Call a tool. See [Call tools](#call-tools).                                                                                                                                                                                                                                                                                                                                          |
| `text(value)`                                | Add a text item to the output. Primitive values are converted to strings; objects are serialized as JSON.                                                                                                                                                                                                                                                                            |
| `image(value)`                               | Add an image to the output: a base64 `data:` URL, an `{ image_url }` object, or an image block `{ type: "image", data, mimeType }` such as those returned by MCP tools and `models.generateImages()`. Remote URLs are not supported. PNG, JPEG, GIF, and WebP are accepted. Each image is also saved to a temp file, and the result names the path or a save error before the image. |
| `console.log(...)`                           | Add a line to the `<console_output>` block after the other output. Arguments are joined with spaces; `info`, `warn`, `error`, and `debug` do the same.                                                                                                                                                                                                                               |
| `return value`                               | A top-level `return` passes the value through JSON serialization, then adds it as text. `undefined` produces no output.                                                                                                                                                                                                                                                              |
| `exit()`                                     | End the script successfully.                                                                                                                                                                                                                                                                                                                                                         |
| `store(key, value)` / `load(key)`            | Keep small JSON values across `codemode` calls. See [Store values](#store-values).                                                                                                                                                                                                                                                                                                   |
| `ALL_TOOLS`                                  | Every callable tool as `{ name, description }`, using its original name, including tools the description does not list.                                                                                                                                                                                                                                                              |
| `searchTools(query, { limit?, namespace? })` | Rank callable tools by relevance (BM25, default limit 8). Resolves to `{ name, description }[]`.                                                                                                                                                                                                                                                                                     |
| `describeTool(name)`                         | Resolves to a tool's description and TypeScript declaration, or `undefined`.                                                                                                                                                                                                                                                                                                         |
| `describeNamespace(name)`                    | Resolves to `{ name, description?, instructions?, tools }` for a namespace such as an MCP server, or `undefined`.                                                                                                                                                                                                                                                                    |
| `models`                                     | List models and run classifiers or image generation. See [Models](#models).                                                                                                                                                                                                                                                                                                          |

## Call tools

Tools that Pi exposes for nested calls are methods of `tools`: active `direct` tools and tools with `codemode` or `deferred` exposure. Tools with `model-only` or `hidden` exposure are not available. Original tool names are canonical: call `tools.read(args)` or use bracket notation for names with punctuation, such as `tools["mcp__dev-radius__search"](args)`. Each method takes one object with the tool's arguments.

Convenience aliases replace characters that are not valid in a JavaScript identifier with `_`. An alias is created only if exactly one tool needs it and it does not conflict with an original name. For example, `foo-bar` and `foo.bar` remain callable through bracket notation, but neither gets the ambiguous alias `foo_bar`. Accessing that alias throws an error listing the canonical calls. If a tool is actually named `foo_bar`, `tools.foo_bar(args)` calls that tool instead.

Pi uses the tool's `reachesTools` declaration to wait for MCP servers named in the source before the call starts. Scripts using discovery globals wait for all servers.

Each script uses a fixed tool snapshot. Tools added during execution become available on the next `codemode` call, when aliases are recomputed; running scripts keep their existing names and aliases. Discovery results and declarations use canonical names, so prefer those over aliases remembered from earlier scripts.

What a call resolves to depends on the tool:

- Tools with an output schema and structured content resolve to that structured value. `bash` resolves to `{ output, truncated, full_output_path?, exit_code, wall_time_seconds }`, also for non-zero exit codes. Its `output` is not limited to the 2000 lines or 50KB the model sees: it keeps up to 1 MiB of output. Longer output keeps its first and last 512 KiB plus an omission marker, with `truncated` set and the full output in `full_output_path`.
- MCP tools resolve to a result object with `content` and optional `isError` and `structuredContent`. Declarations spell out these fields without a shared `CallToolResult` type. Without a declared structured-output schema, `structuredContent` is `unknown` and can be an array, primitive, or `null`.
- `read` resolves to the file's text, or for a successfully processed image to an image block `{ type: "image", data, mimeType, note }` that `image()` shows. `data` is the base64 image the model would see and `note` the text that goes with it, such as resize hints.
- Other tools, such as `edit` and `write`, resolve to their text output.

A call can reject with an `Error` or resolve to a structured error result. When a tool declares an output schema and returns structured content, the script receives that content even if the tool reports an error. Check the tool's failure fields, such as `exit_code` for `bash` and `isError` for MCP tools. A returned error does not fail the script by itself; throw an error if it should. Without structured content, a failed call rejects with the tool's error text.

Use `Promise.allSettled()` to wait for every call and inspect each outcome. `Promise.all()` stops waiting at the first rejection; if that rejection ends the script, calls still running receive an abort signal.

The `codemode` description lists tools with their TypeScript declarations, grouped by namespace (for example one MCP server). Tools with `deferred` exposure, which includes MCP tools with the default `codemode` exposure, are not listed, so the description stays the same while MCP servers connect.
Property comments include schema constraints such as `@integer`, `@minimum`, `@maxLength`, and `@default`. These are guidance, not sandbox-side argument validation. Constraint tags are omitted before a declaration falls back to `unknown` when its input type is too large.
Listed declarations share a budget of 3000 estimated tokens (`codemode.inlineBudget` in Pi settings). Scripts find the other tools with `searchTools()`, `describeTool()`, `describeNamespace()`, or by filtering `ALL_TOOLS`. Use declarations already in context before making discovery calls.

Discovery calls return values without printing them; use `text(await searchTools("query"))` to show the results. `describeTool()` and `describeNamespace()` return `undefined` when no match exists. `describeTool()` also accepts safe aliases and rejects ambiguous aliases with an error listing the canonical calls. The `tools` global is not itself a registered namespace, so `describeNamespace("tools")` only works if a namespace has that name.

Namespace lookup and the `searchTools()` namespace filter accept a namespace's name or explicitly registered aliases, including their normalized identifiers. MCP registers the server name as an alias. A suffix after `__` is not automatically an alias.

While `codemode` is active, `codemode.mode` in Pi settings decides how the other tools are presented. With `on` (default) declared tools stay declared; tools that are also callable from scripts have that usage added to their descriptions. With `only`, active `direct` tools are hidden from the model and become eligible for listing in the `codemode` description, within its budget. Deferred tools remain excluded from that description, and `model-only` tools remain declared. Tool declarations in the `codemode` description, `describeTool()`, and `ALL_TOOLS` carry the tools' prompt guidelines, since the system prompt rules only cover declared tools.

## Store values

`store(key, value)` keeps a JSON value under a string key for later `codemode` calls; storing `undefined` deletes the key. `load(key)` returns the value, or `undefined`. Writes are kept only when the script succeeds: each successful script that stores values appends a `codemode-store` custom entry to the session, so resumed sessions keep the values and each branch sees only the values written on its path.

The store is for small state such as IDs, cursors, or summaries. One value may have at most 262144 characters of JSON. All keys and serialized values together may have at most 1048576 characters. Do not store image data; show images with `image()`, which also saves them to a temp file.

## Models

`models` reaches the model catalog and runs two types of model with the session's credentials: classifiers, which answer typed questions about JSON state and, for some models, images, and image models, which generate images. Chat models are listed but cannot be run from scripts. Use `models.getModelsOfType(type)` to list known models and `models.getAvailableOfType(type)` to list models available under the configured authentication. This does not guarantee that the provider will accept a request.

```ts
type ModelType = "chat" | "image" | "classifier";

/** A catalog entry. `provider` and `id` identify it; other fields depend on the type. */
interface ModelInfo {
  type?: ModelType;
  provider: string;
  id: string;
  name: string;
  api: string;
  input: ("text" | "image")[];
  contextWindow?: number;
  [key: string]: unknown;
}

type ModelRef = Pick<ModelInfo, "provider" | "id">;

declare const models: {
  /** Every known model of a type, optionally for one provider. */
  getModelsOfType(type: ModelType, provider?: string): Promise<ModelInfo[]>;
  /** Models of a type available under the configured authentication. */
  getAvailableOfType(type: ModelType, provider?: string): Promise<ModelInfo[]>;
  /** One catalog entry, or undefined. */
  getModelOfType(type: ModelType, provider: string, id: string): Promise<ModelInfo | undefined>;
  /** Answer `context.questions` about `context.state`; answers are in `result.answers` by question ID. */
  classify(model: ModelRef, context: ClassifierContext): Promise<ClassifierResult>;
  /** Generate images from `context.input` text and image blocks; show `result.output` blocks with image(). Can take minutes. */
  generateImages(model: ModelRef, context: ImagesContext): Promise<ImagesResult>;
};
```

`classify()` and `generateImages()` use only the `provider` and `id` of `model`, so `{ provider, id }` works as well. They resolve the model from the session's registry, not from script-supplied endpoints or credentials. Check `stopReason` and `errorMessage` for errors returned by the provider.
Calls can also reject: invalid model references and contexts throw before the provider is called. Pi's model registry converts provider failures into results with `stopReason: "error"` or `"aborted"`; check the result even when the call resolves. At most four classification and image-generation calls combined run at once per script; more calls wait for a free slot, so `Promise.all()` over many items is fine. Their usage is added to the `codemode` tool result and counts toward the session cost.

Model IDs differ between providers, for example `typesafe/jev-latest` and `openrouter/typesafe/jev-1.13`. Use `models.getAvailableOfType(type)` to find IDs available under the current authentication.

### Classify

```ts
interface ClassifierContext {
  /** The data to classify. */
  state: Record<string, unknown>;
  /** Images judged together with `state`. Only models whose `input` includes "image" accept them. */
  images?: { type: "image"; data: string; mimeType: string }[];
  /** Questions by ID. One call answers all of them. */
  questions: Record<string, ClassifierQuestion>;
}

type ClassifierQuestion =
  /** Pick one label. `criteria` maps each label to what it means. */
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  /** Score on an ordered scale. `criteria` describes each level, lowest first. */
  | { type: "score"; instructions: string; criteria: string[] }
  /** Yes or no. */
  | { type: "bool"; instructions: string; criteria: { true: string; false: string } };

interface ClassifierResult {
  provider: string;
  model: string;
  /** Answers by question ID. */
  answers: Record<string, ClassifierAnswer>;
  usage?: ModelUsage;
  stopReason: "stop" | "error" | "aborted";
  errorMessage?: string;
}

type ClassifierAnswer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  /** `score` is the expected level index, from 0 to `criteria.length - 1`. */
  | { type: "score"; score: number; confidence: number }
  /** Probability of `true`. */
  | { type: "bool"; probability: number };

/** Token counts and cost in USD, when the service reports them. */
type ModelUsage = { input: number; output: number; totalTokens: number; cost: { total: number } };
```

Classify several items by calling `classify()` once per item. This script sorts feedback messages, for example ones a tool returned earlier in the script:

```js
const jev = await models.getModelOfType("classifier", "typesafe", "jev-latest");
const results = await Promise.all(
  messages.map((message) =>
    models.classify(jev, {
      state: { message },
      questions: {
        sentiment: {
          type: "choice",
          instructions: "How does the user feel about the product?",
          criteria: { positive: "Satisfied or happy", negative: "Unhappy or frustrated", neutral: "Neither" },
        },
        urgency: {
          type: "score",
          instructions: "How urgently does this need a reply?",
          criteria: ["no reply needed", "reply this week", "reply today"],
        },
      },
    }),
  ),
);
return results.map((result, i) =>
  result.stopReason === "stop"
    ? { message: messages[i], sentiment: result.answers.sentiment.choice, urgency: result.answers.urgency.score }
    : { message: messages[i], error: result.errorMessage },
);
```

Classifiers whose `input` includes `"image"` also judge images. `tools.read()` returns an image file as an image block that `images` accepts. Other classifiers return an error result when `images` is not empty.

```js
const luna = await models.getModelOfType("classifier", "openai", "gpt-6-luna");
const photo = await tools.read({ path: "screenshot.png" });
const result = await models.classify(luna, {
  state: { task: "Settings page redesign" },
  images: [photo],
  questions: {
    broken: {
      type: "bool",
      instructions: "Does the screenshot show a broken layout?",
      criteria: { true: "Overlapping, cut-off, or misaligned elements", false: "Clean layout" },
    },
  },
});
```

### Generate images

```ts
interface ImagesContext {
  /** The prompt as text blocks, plus image blocks to edit or use as references. */
  input: (TextBlock | ImageBlock)[];
}

interface ImagesResult {
  provider: string;
  model: string;
  /** Generated images, and text blocks for models that also return text. */
  output: (TextBlock | ImageBlock)[];
  usage?: ModelUsage;
  stopReason: "stop" | "error" | "aborted";
  errorMessage?: string;
}

type TextBlock = { type: "text"; text: string };
/** `data` is base64. */
type ImageBlock = { type: "image"; data: string; mimeType: string };
```

Show generated images with `image(block)`. Do not print `data` with `text()`, `console`, or `return`: it is large and the model cannot read it as text. `image()` also saves each image to a temp file and puts its path in the result, so a later turn can copy or move the file.

```js
// @options: {"timeout_ms": 300000}
const painter = await models.getModelOfType("image", "openrouter", "google/gemini-2.5-flash-image");
const result = await models.generateImages(painter, {
  input: [{ type: "text", text: "A red fox in the snow, watercolor" }],
});
if (result.stopReason !== "stop") return result.errorMessage;
for (const block of result.output) {
  if (block.type === "image") image(block);
  else text(block.text);
}
```

## Limits

- A script's VM has 256 MiB of memory. Running out throws `InternalError: out of memory`; filter or aggregate large data instead of accumulating it.
- A script that waits on a promise that can never settle (no tool, discovery, or model call pending) fails immediately, since there are no timers.
- Scripts cannot start other `codemode` scripts.
