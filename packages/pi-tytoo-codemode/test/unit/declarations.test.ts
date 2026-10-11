import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { MCP_TYPESCRIPT_PREAMBLE, renderDeclarations } from "#src/declarations/render";

it("compiles the shared MCP asset and generated tool declarations together", async () => {
  // Arrange
  const directory = await mkdtemp(join(tmpdir(), "tytoo-declarations-"));
  const compiler = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin/tsc");
  const source = `${MCP_TYPESCRIPT_PREAMBLE}\n${renderDeclarations({
    tools: [
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
  })}\nasync function example() { const result = await tools.search({ query: "hello" }); return result.content.map(block => block.type); }`;
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
