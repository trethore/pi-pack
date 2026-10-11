// Generated from prompts.yaml by npm run build:prompts. Do not edit.
export const prompts = {
  tool: {
    code: "Raw JavaScript source.",
    snippet: "Run JavaScript that calls other tools",
    guidelines: [
      "Use codemode to batch independent tool calls (Promise.allSettled), chain them, or filter large output, instead of many separate calls.",
    ],
    description:
      'Run JavaScript that calls other tools. The input is raw JavaScript (not JSON, no code fence), run as an async function body in a QuickJS sandbox: top-level `await` and `return` work. No Node, file system, network, or timers.\n- `await tools.<name>({ ...args })` resolves to a string, or an object if the tool\'s declaration says so, and rejects with an Error on failure. Calls still running when the script ends are cancelled.\n- Optional first line: `// @options: {"max_output_tokens": 10000, "timeout_ms": 60000}`',
    globals:
      "Globals:\n- `text(value)`, `image(dataUrlOrImageBlock)`, `console.log(...)`, and top-level `return` add output; `exit()` ends the script. With several text items, each starts with a `==> text N/M <==` line, and `console` lines follow the other output in one `<console_output>` block. `image()` also saves the image to a temp file and the result names its path.\n- `store(key, value)` and `load(key)` keep JSON values across codemode calls.\n- `ALL_TOOLS`, `await searchTools(query, { limit?, namespace? })`, `await describeTool(name)`, `await describeNamespace(name)`: find unlisted tools, such as MCP tools.",
    models: (values: { docsPath: string | number }): string =>
      `- \`models\`: classifiers and image generation. Read ${values.docsPath} first.`,
    sharedMcpTypes: "Shared MCP Types:\n```ts",
    stringOutput: "a string",
    scriptCall: (values: { name: string | number; output: string | number }): string =>
      `Codemode: \`tools.${values.name}(args)\` resolves to ${values.output}.`,
    nestedTools: "Nested tools:",
    toolsNotListed: " (tools not listed)",
    someToolsNotListed: " (some tools not listed)",
    declaration: (values: {
      description: string | number;
      declaration: string | number;
    }): string => `${values.description}

codemode tool declaration:
\`\`\`ts
${values.declaration}
\`\`\``,
  },
  results: {
    toolFailed: (values: { name: string | number }): string => `Tool "${values.name}" failed`,
    scriptError: (values: { error: string | number }): string => `Script error:
${values.error}`,
    unshownImages: (values: { count: string | number; suffix: string | number }): string =>
      `Note: models.generateImages() returned ${values.count} image${values.suffix} that the script did not show. Show each image block of result.output with image(block).`,
    header: (values: { status: string | number; wallTime: string | number }): string => `${values.status}
Wall time ${values.wallTime} seconds
Output:
`,
    completed: "Script completed",
    failed: "Script failed",
    textItem: (values: {
      index: string | number;
      total: string | number;
      text: string | number;
    }): string => `==> text ${values.index}/${values.total} <==
${values.text}`,
    console: (values: { lines: string | number }): string => `<console_output>
${values.lines}
</console_output>`,
    noCalls: "No tool calls were made.",
    partialFailure: (values: { calls: string | number }): string =>
      `Tool calls made before the failure (they are not undone): ${values.calls}`,
    timedOut: (values: { message: string | number }): string => `Script timed out: ${values.message}`,
    aborted: (values: { message: string | number }): string => `Script aborted: ${values.message}`,
    sandboxFailed: (values: { message: string | number }): string => `Script sandbox failed: ${values.message}`,
    truncatedWarning: (values: { tokens: string | number }): string =>
      `Warning: truncated output (original token count: ${values.tokens})`,
    lineCount: (values: { count: string | number }): string => `Total output lines: ${values.count}`,
    truncatedBody: (values: { head: string | number; tokens: string | number; tail: string | number }): string =>
      `${values.head}...${values.tokens} tokens truncated...${values.tail}`,
    fullOutput: (values: { path: string | number }): string => `

[Full output: ${values.path} (read with offset/limit)]`,
    fullOutputFailed: (values: { error: string | number }): string => `

[Could not save the full output: ${values.error}]`,
    imageSaved: (values: { path: string | number; kind: string | number }): string =>
      `[Image saved to ${values.path} (${values.kind})]`,
    imageSaveFailed: (values: { kind: string | number; error: string | number }): string =>
      `[Image (${values.kind}) could not be saved: ${values.error}]`,
    outputLimit: (values: { characters: string | number; items: string | number }): string =>
      `script output exceeded the limit of ${values.characters} characters or ${values.items} text(), image(), and console calls. Print a summary instead, or write large data to a file with a tool.`,
    stalled:
      "The script is waiting on a promise that can never settle: no tool call is pending, and timers do not exist here.",
  },
  models: {
    classifierContext:
      '{ state: { ... }, images?: [{ type: "image", data: <base64>, mimeType }], questions: { <id>: { type: "choice", instructions, criteria: { <label>: <meaning> } } | { type: "score", instructions, criteria: [<lowest level>, ..., <highest level>] } | { type: "bool", instructions, criteria: { true: <meaning>, false: <meaning> } } } }',
    lookupArguments: (values: { name: string | number; values: string | number }): string =>
      `${values.name}(type, provider, id) expects three strings, got (${values.values}). The provider and the id are separate arguments, for example ${values.name}("classifier", "typesafe", "jev-latest").`,
    classifierError: (values: {
      name: string | number;
      problem: string | number;
      shape: string | number;
      docsPath: string | number;
    }): string =>
      `${values.name}() ${values.problem}. Expected context: ${values.shape}. See "Classify" in ${values.docsPath}.`,
    imagesError: (values: { name: string | number; problem: string | number; docsPath: string | number }): string =>
      `${values.name}() ${values.problem}. Expected context: { input: [{ type: "text", text: <prompt> }, ...optional { type: "image", data: <base64>, mimeType } references] }. See "Generate images" in ${values.docsPath}.`,
    listAvailable: (values: { type: string | number; name: string | number }): string =>
      `List the ${values.type} models you can use with ${values.name}("${values.type}").`,
    unknownLookup: (values: { name: string | number }): string =>
      ` ${values.name}() returns undefined for an unknown provider or id.`,
    expectedModel: (values: {
      name: string | number;
      type: string | number;
      value: string | number;
      undefinedHint: string | number;
      listHint: string | number;
    }): string =>
      `${values.name}() expects ${values.type} model as its first argument, got ${values.value}.${values.undefinedHint} ${values.listHint}`,
    wrongModelType: (values: {
      ref: string | number;
      actualType: string | number;
      type: string | number;
      listHint: string | number;
    }): string => `"${values.ref}" is ${values.actualType} model, not ${values.type} model. ${values.listHint}`,
    unknownModel: (values: { type: string | number; ref: string | number; listHint: string | number }): string =>
      `Unknown ${values.type} model "${values.ref}". ${values.listHint}`,
    unknownType: (values: { value: string | number }): string =>
      `Unknown model type ${values.value}. Use "chat", "image", or "classifier".`,
  },
  discovery: {
    toolHint: "ALL_TOOLS lists every tool; searchTools(query) finds tools by topic.",
    missingMember: (values: { label: string | number; property: string | number }): string =>
      `${values.label}.${values.property} does not exist.`,
    suggestions: (values: { names: string | number }): string => ` Did you mean ${values.names}?`,
    available: (values: { names: string | number }): string => ` Available: ${values.names}.`,
    checkMember: (values: { message: string | number; property: string | number; label: string | number }): string =>
      `${values.message} Check for a member with "${values.property}" in ${values.label}.`,
  },
  store: {
    hint: "store() is for small state such as IDs or summaries. Show images with image(), keep large data in variables, or write it to a file with a tool.",
    valueTooLarge: (values: {
      key: string | number;
      size: string | number;
      limit: string | number;
      hint: string | number;
    }): string =>
      `store(${values.key}) value has ${values.size} characters of JSON, more than the limit of ${values.limit}. ${values.hint}`,
    full: (values: { limit: string | number; hint: string | number }): string =>
      `store is full: stored values would exceed ${values.limit} characters of JSON. Delete keys with store(key, undefined). ${values.hint}`,
  },
  images: {
    expected: "image expects a non-empty image URL string, an object with image_url, or a raw MCP image block",
    invalidDataUri: "invalid image output. Pass a base64 data URI instead",
    remoteUrl: "remote image URLs are not supported in tool outputs. Pass a base64 data URI instead",
  },
  source: {
    optionsObject: (values: { fields: string | number }): string =>
      `@options must be a JSON object with supported fields ${values.fields}`,
    optionsJson: (values: { fields: string | number; error: string | number }): string =>
      `@options must be valid JSON with supported fields ${values.fields}: ${values.error}`,
    unsupportedOption: (values: { fields: string | number; key: string | number }): string =>
      `@options only supports ${values.fields}; got \`${values.key}\``,
    outputTokens: "@options field `max_output_tokens` must be a non-negative safe integer",
    timeout: (values: { limit: string | number }): string =>
      `@options field \`timeout_ms\` must be a positive integer up to ${values.limit}`,
    empty:
      'Expected JavaScript source text (non-empty). Provide JS only, optionally with a first line `// @options: {"max_output_tokens": 1000}`.',
    missingCode: "The @options line must be followed by JavaScript source on subsequent lines",
  },
} as const;
