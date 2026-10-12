import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { dedent } from "@pi-pack/shared/dedent";
import { MCP_TYPESCRIPT_PREAMBLE, renderDeclarations, type RenderDeclarationsOptions } from "#src/declarations/render";

const execute = () => undefined;

it("compiles the shared MCP asset and generated tool declarations together", async () => {
  // Arrange
  const directory = await mkdtemp(join(tmpdir(), "tytoo-declarations-"));
  const compiler = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin/tsc");
  const canonicalNames = ["foo-bar", "foo_bar", 'quoted"name'];
  const calls = canonicalNames
    .map((name, index) => `const result${index}: ${JSON.stringify(name)} = await tools[${JSON.stringify(name)}]({});`)
    .join("\n");
  const source = `${MCP_TYPESCRIPT_PREAMBLE}\n${renderDeclarations({
    tools: [
      ...canonicalNames.map((name) => ({
        name,
        execute,
        inputSchema: { type: "object", additionalProperties: false },
        outputSchema: { const: name },
      })),
      {
        name: "search",
        execute: () => undefined,
        inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        outputSchema: {
          type: "object",
          properties: {
            content: { type: "array", items: { type: "object" } },
            isError: { type: "boolean" },
            _meta: { type: "object" },
          },
        },
      },
    ],
  })}\nasync function example() { ${calls} const result = await tools.search({ query: "hello" }); return result.content.map(block => block.type); }`;
  try {
    await writeFile(join(directory, "test.ts"), source);
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, types: [], lib: ["ES2024"] },
        files: ["test.ts"],
      }),
    );

    // Act
    const result = spawnSync(process.execPath, [compiler, "-p", directory], { encoding: "utf8" });

    // Assert
    expect(result.status, result.stdout + result.stderr).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it.each<RenderDeclarationsOptions>([{}, { tools: [], globals: [] }])(
  "renders no declarations for empty options %j",
  (options) => {
    // Act
    const result = renderDeclarations(options);

    // Assert
    expect(result).toBe("");
  },
);

it("renders tools before plain globals and groups namespaces in encounter order", () => {
  // Arrange
  const options: RenderDeclarationsOptions = {
    tools: [{ name: "read", execute }],
    globals: [
      { name: "models.list", signature: "(): void", execute },
      { name: "first", signature: "(): void", execute },
      { name: "files.read", signature: "(): void", execute },
      { name: "models.get", signature: "(): void", execute },
      { name: "second", signature: "(): void", execute },
    ],
  };

  // Act
  const result = renderDeclarations(options);

  // Assert
  expect(result).toBe(
    dedent(`
      declare const tools: {
        read(args: unknown): Promise<unknown>;
      };

      declare function first(): void;

      declare function second(): void;

      declare const models: {
        list(): void;
        get(): void;
      };

      declare const files: {
        read(): void;
      };
    `),
  );
});
