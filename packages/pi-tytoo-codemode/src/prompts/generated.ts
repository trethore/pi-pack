// Generated from prompts.yaml by npm run build:prompts. Do not edit.
export const prompts = {
  tool: {
    code: "JavaScript source code.",
    snippet: "Run JavaScript that calls other tools",
    guidelines: [
      "Use Promise.allSettled() for independent tool calls. Run dependent calls in order.",
      "Filter large results before you print them.",
      "Await every call you need. When the script ends, pending calls receive an abort signal. Earlier tool actions are not undone.",
    ],
    description:
      'Run JavaScript in QuickJS. Use source code, not JSON or Markdown code fences. Top-level `await` and `return` work.\nScripts have no direct access to Node.js APIs, files, networks, or timers.\n`await tools.<name>(args)` returns text or declared structured output. Calls can throw errors. Structured error results can return normally. Check fields such as `isError`.\nOptional first line: `// @options: {"max_output_tokens": 10000}`\n`max_output_tokens` sets an estimated text budget. Optional `timeout_ms` sets a deadline for the whole script. By default, no deadline is set.',
    globals:
      'Globals:\n- `text(value)`, `console.log(...)`, and `return value` print output. `exit()` ends the script.\n- `image(value)` shows an image from a base64 data URL or image block. The result includes a saved file path or a save error.\n- `store(key, value)` and `load(key)` keep small JSON values across calls. Writes persist only when the script succeeds.\n- `ALL_TOOLS` lists tools available to this script. Find tools with `searchTools(query, options)`. Optional search fields: `limit`, `namespace`.\n- Get tool or namespace details with `await describeTool(name)` or `await describeNamespace(name)`.\n- Print discovery results: `text(await searchTools("query"))`.',
    models: (values: { docsPath: string | number }): string =>
      `- \`models\`: classifiers and image generation. Before you use \`models\`, read ${values.docsPath}.`,
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
      `Note: models.generateImages() returned ${values.count} image${values.suffix}, but the script showed none. Use image(block) for each image block in result.output.`,
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
      `Earlier tool actions are not undone. Calls: ${values.calls}`,
    timedOut: (values: { message: string | number }): string => `Script timed out: ${values.message}`,
    aborted: (values: { message: string | number }): string => `Script aborted: ${values.message}`,
    sandboxFailed: (values: { message: string | number }): string => `Script sandbox failed: ${values.message}`,
    truncatedWarning: (values: { tokens: string | number }): string =>
      `Warning: truncated output (estimated original tokens: ${values.tokens})`,
    lineCount: (values: { count: string | number }): string => `Total output lines: ${values.count}`,
    truncatedBody: (values: { head: string | number; tokens: string | number; tail: string | number }): string =>
      `${values.head}...about ${values.tokens} tokens removed...${values.tail}`,
    fullOutput: (values: { path: string | number }): string => `

[Full output: ${values.path} (read with offset/limit)]`,
    fullOutputFailed: (values: { error: string | number }): string => `

[Could not save the full output: ${values.error}]`,
    imageSaved: (values: { path: string | number; kind: string | number }): string =>
      `[Image saved to ${values.path} (${values.kind})]`,
    imageSaveFailed: (values: { kind: string | number; error: string | number }): string =>
      `[Image (${values.kind}) could not be saved: ${values.error}]`,
    outputLimit: (values: { characters: string | number; items: string | number }): string =>
      `Script output exceeded ${values.characters} characters or ${values.items} output calls. Print a summary. Use a tool to save large data to a file.`,
    stalled:
      "The script is waiting for a promise that cannot settle. No tool call is pending. Timers are not available.",
  },
  models: {
    classifierContext:
      '{\n  state: {},\n  questions: {\n    check: {\n      type: "bool",\n      instructions: "Is the item valid?",\n      criteria: { true: "Valid", false: "Invalid" }\n    }\n  }\n}\nFor "choice", criteria maps each label to its meaning.\nFor "score", criteria lists levels from lowest to highest.\nThe optional images array contains blocks: { type: "image", data: "<base64>", mimeType: "image/png" }.',
    lookupArguments: (values: { name: string | number; values: string | number }): string =>
      `${values.name}(type, provider, id) requires three strings. Received: (${values.values}). Pass provider and id as separate arguments.`,
    classifierError: (values: {
      name: string | number;
      problem: string | number;
      shape: string | number;
      docsPath: string | number;
    }): string => `${values.name}(): ${values.problem}.
Example context:
${values.shape}
See "Classify" in ${values.docsPath}.`,
    imagesError: (values: {
      name: string | number;
      problem: string | number;
      docsPath: string | number;
    }): string => `${values.name}(): ${values.problem}.
input must contain at least one text or image block.
Example context: { input: [{ type: "text", text: "Draw a tree." }] }
Image blocks use { type: "image", data: "<base64>", mimeType: "image/png" }.
See "Generate images" in ${values.docsPath}.`,
    listAvailable: (values: { type: string | number; name: string | number }): string =>
      `Find available ${values.type} models with ${values.name}("${values.type}").`,
    unknownLookup: (values: { name: string | number }): string =>
      ` ${values.name}() returns undefined for an unknown provider or id.`,
    expectedModel: (values: {
      name: string | number;
      type: string | number;
      value: string | number;
      undefinedHint: string | number;
      listHint: string | number;
    }): string =>
      `${values.name}() requires ${values.type} model as its first argument. Received ${values.value}.${values.undefinedHint} ${values.listHint}`,
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
    toolHint: "ALL_TOOLS lists tools available to this script. Use searchTools(query) to find a tool.",
    missingMember: (values: { label: string | number; property: string | number }): string =>
      `${values.label}.${values.property} does not exist.`,
    suggestions: (values: { names: string | number }): string => ` Did you mean ${values.names}?`,
    available: (values: { names: string | number }): string => ` Available: ${values.names}.`,
  },
  store: {
    hint: "Use store() for small JSON values, such as IDs or summaries. Show images with image(). Variables last only for this script. Use a tool to save large data to a file.",
    valueTooLarge: (values: {
      key: string | number;
      size: string | number;
      limit: string | number;
      hint: string | number;
    }): string =>
      `store(${values.key}) value has ${values.size} characters of JSON. The limit is ${values.limit}. ${values.hint}`,
    full: (values: { limit: string | number; hint: string | number }): string =>
      `The store would exceed ${values.limit} characters of JSON. Delete keys with store(key, undefined). ${values.hint}`,
  },
  images: {
    expected:
      "image() accepts a base64 data URL, an { image_url } object, or an image block. HTTP and HTTPS URLs are not supported.",
    invalidDataUri: "Invalid image data URL. Use data:<mimeType>;base64,<data>.",
    remoteUrl: "HTTP and HTTPS image URLs are not supported. Use a base64 data URL.",
  },
  source: {
    optionsObject: (values: { fields: string | number }): string =>
      `@options must be a JSON object. Supported fields: ${values.fields}.`,
    optionsJson: (values: { error: string | number; fields: string | number }): string =>
      `Invalid @options JSON: ${values.error}. Supported fields: ${values.fields}.`,
    unsupportedOption: (values: { key: string | number; fields: string | number }): string =>
      `Unsupported @options field \`${values.key}\`. Use ${values.fields}.`,
    outputTokens: "@options field `max_output_tokens` must be a non-negative safe integer.",
    timeout: (values: { limit: string | number }): string =>
      `@options field \`timeout_ms\` must be a positive integer up to ${values.limit} milliseconds.`,
    empty: "Provide JavaScript source. Do not use JSON or Markdown code fences.",
    missingCode: "Put JavaScript source after the @options line.",
  },
} as const;
