import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { CODEMODE_DOCS_PATH } from "#src/constants";

const root = fileURLToPath(new URL("../../", import.meta.url));

describe("sandbox build artifacts", () => {
  it("returns the prelude initializer without host imports or leaked globals", () => {
    // Arrange
    const source = readFileSync(join(root, "dist/sandbox/prelude.js"), "utf8");
    const context = vm.createContext({});

    // Act
    const initializer: unknown = new vm.Script(source).runInContext(context);

    // Assert
    expect(initializer).toBeTypeOf("function");
    expect(Object.keys(context)).toEqual([]);
  });

  it("keeps worker dependencies external and emits a source map", () => {
    // Arrange
    const source = readFileSync(join(root, "dist/sandbox/worker.js"), "utf8");
    const sourceMap = readFileSync(join(root, "dist/sandbox/worker.js.map"), "utf8");

    // Act
    const map: unknown = JSON.parse(sourceMap);

    // Assert
    expect(source).toMatch(/from ["']quickjs-wasi["']/);
    expect(source).toMatch(/from ["']node:worker_threads["']/);
    expect(source).not.toContain("#src/");
    expect(source).toContain("sourceMappingURL=worker.js.map");
    expect(map).toMatchObject({ version: 3, file: "worker.js" });
    expect(map).toHaveProperty("sources", expect.arrayContaining([expect.stringContaining("src/sandbox/worker.ts")]));
    expect(map).toHaveProperty("sourcesContent", expect.arrayContaining([expect.stringContaining("QuickJS.create")]));
  });
});

describe("bundled manual", () => {
  it("resolves the manual inside the extension package", () => {
    // Act
    const manual = readFileSync(CODEMODE_DOCS_PATH, "utf8");

    // Assert
    expect(CODEMODE_DOCS_PATH).toBe(join(root, "manual/codemode.md"));
    expect(manual).toContain("# Codemode");
    expect(manual).toContain("### Classify");
    expect(manual).toContain("### Generate images");
  });

  it("includes the manual in published package files", () => {
    // Arrange
    const manifest = readFileSync(join(root, "package.json"), "utf8");

    // Act
    const pkg: unknown = JSON.parse(manifest);

    // Assert
    expect(pkg).toHaveProperty("files", expect.arrayContaining(["manual"]));
  });
});
