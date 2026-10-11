import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

let root: string;
let upstream: string;
let output: string;
let script: string;
const source =
  'import { expect, it } from "vitest";\nimport { CodemodeSandbox } from "../src/index.ts";\nit("sample", () => expect(CodemodeSandbox).toBeDefined());\n';
const sourcePath = () => join(upstream, "packages/codemode/test/sample.test.ts");
function git(...args: string[]): string {
  return execFileSync("git", ["-C", upstream, ...args], { encoding: "utf8" });
}
function commit(): void {
  git("add", "packages");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "-qm",
    "test snapshot",
  );
}
function run() {
  return spawnSync(process.execPath, [script, upstream], { encoding: "utf8" });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "tytoo-import-"));
  upstream = join(root, "upstream");
  output = join(root, "extension");
  script = join(output, "scripts/import-upstream-tests.mjs");
  await mkdir(join(upstream, "packages/codemode/test"), { recursive: true });
  await mkdir(join(output, "scripts"), { recursive: true });
  await copyFile(join(packageRoot, "scripts/import-upstream-tests.mjs"), script);
  git("init", "-q");
  await writeFile(sourcePath(), source);
  commit();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("upstream test imports", () => {
  it("records provenance and imports reproducibly without changing assertions", async () => {
    // Act
    const first = run();
    const baseline = await readFile(join(output, "upstream/baseline.json"), "utf8");
    const second = run();

    // Assert
    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(await readFile(join(output, "test/upstream/sample.test.ts"), "utf8")).toBe(
      source.replace("../src/index.ts", "#test/support/upstream-adapter"),
    );
    expect(await readFile(join(output, "upstream/baseline.json"), "utf8")).toBe(baseline);
    expect(baseline).toContain(git("rev-parse", "HEAD").trim());
  });

  it("resolves nested upstream imports and worker URLs from their source file", async () => {
    // Arrange
    const fixture = [
      'import { CodemodeSandbox } from "../../src/index.ts";',
      "const worker = new URL( '../../src/runtime/worker.ts' , import.meta.url );",
      'const missing = new URL("./does-not-exist.js", import.meta.url);',
    ].join("\n");
    await mkdir(join(upstream, "packages/codemode/test/fixtures"));
    await writeFile(join(upstream, "packages/codemode/test/fixtures/nested.ts"), fixture);
    commit();

    // Act
    const result = run();

    // Assert
    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(output, "test/upstream/fixtures/nested.ts"), "utf8")).toBe(
      fixture
        .replace("../../src/index.ts", "#test/support/upstream-adapter")
        .replace("../../src/runtime/worker.ts", "../../../dist/sandbox/worker.js"),
    );
  });

  it("preserves the previous suite and baseline when backup fails", async () => {
    // Arrange
    expect(run().status).toBe(0);
    const target = join(output, "test/upstream/sample.test.ts");
    const manifest = join(output, "upstream/baseline.json");
    const previousTest = await readFile(target, "utf8");
    const previousBaseline = await readFile(manifest, "utf8");
    await mkdir(join(output, "test/upstream.previous"));
    await writeFile(join(output, "test/upstream.previous/keep.txt"), "existing backup");
    await writeFile(sourcePath(), source + "\n");
    commit();

    // Act
    const result = run();

    // Assert
    expect(result.status).not.toBe(0);
    expect(await readFile(target, "utf8")).toBe(previousTest);
    expect(await readFile(manifest, "utf8")).toBe(previousBaseline);
    expect(await readFile(join(output, "test/upstream.previous/keep.txt"), "utf8")).toBe("existing backup");
    await expect(readFile(join(output, "test/upstream.staging/sample.test.ts"))).rejects.toThrow();
    await expect(readFile(`${manifest}.staging`)).rejects.toThrow();
  });

  it("restores the previous suite when manifest replacement fails after installing new tests", async () => {
    // Arrange
    expect(run().status).toBe(0);
    const target = join(output, "test/upstream/sample.test.ts");
    const manifest = join(output, "upstream/baseline.json");
    const previousTest = await readFile(target, "utf8");
    const previousBaseline = await readFile(manifest, "utf8");
    await writeFile(sourcePath(), source + "\n");
    await writeFile(join(upstream, "packages/codemode/test/added.test.ts"), source);
    commit();

    const preload = pathToFileURL(join(packageRoot, "test/support/fail-manifest-replacement.mjs")).href;

    // Act
    const result = spawnSync(process.execPath, ["--import", preload, script, upstream], { encoding: "utf8" });

    // Assert
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Injected manifest replacement failure");
    expect(await readFile(target, "utf8")).toBe(previousTest);
    expect(await readFile(manifest, "utf8")).toBe(previousBaseline);
    await expect(stat(join(output, "test/upstream/added.test.ts"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(output, "test/upstream.previous"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(output, "test/upstream.staging"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(`${manifest}.staging`)).rejects.toMatchObject({ code: "ENOENT" });

    const retry = run();
    expect(retry.status, retry.stderr).toBe(0);
    expect(retry.stdout).toContain("changed sample.test.ts");
    expect(retry.stdout).toContain("added added.test.ts");
  });

  it("rejects dirty upstream source", async () => {
    // Arrange
    await writeFile(sourcePath(), source + "\n");

    // Act
    const result = run();

    // Assert
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("use a clean checkout");
  });

  it("does not mistake test descriptions for imports", async () => {
    // Arrange
    const description = 'it("rejects dynamic import", async () => { await import("node:fs"); });\n';
    await writeFile(sourcePath(), source + description);
    commit();

    // Act
    const result = run();

    // Assert
    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(output, "test/upstream/sample.test.ts"), "utf8")).toContain(description);
  });

  it("rejects unknown side-effect imports", async () => {
    // Arrange
    await writeFile(sourcePath(), 'import "unexpected-package";\n' + source);
    commit();

    // Act
    const result = run();

    // Assert
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unexpected upstream dependency");
  });

  it("refuses to overwrite local changes", async () => {
    // Arrange
    expect(run().status).toBe(0);
    const target = join(output, "test/upstream/sample.test.ts");
    await writeFile(target, "local changes");

    // Act
    const result = run();

    // Assert
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing to overwrite");
    expect(await readFile(target, "utf8")).toBe("local changes");
  });

  it("leaves the previous suite intact when upstream introduces an unknown import", async () => {
    // Arrange
    expect(run().status).toBe(0);
    const target = join(output, "test/upstream/sample.test.ts");
    const previous = await readFile(target, "utf8");
    await writeFile(sourcePath(), source.replace("../src/index.ts", "../src/new-runtime.ts"));
    commit();

    // Act
    const result = run();

    // Assert
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unmapped upstream import");
    expect(await readFile(target, "utf8")).toBe(previous);
  });

  it("removes deleted upstream tests but preserves our support directory", async () => {
    // Arrange
    expect(run().status).toBe(0);
    await mkdir(join(output, "test/support"));
    await writeFile(join(output, "test/support/adapter.ts"), "owned by us");
    await rm(sourcePath());
    await writeFile(join(upstream, "packages/codemode/test/new.test.ts"), source);
    commit();

    // Act
    const result = run();

    // Assert
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("removed sample.test.ts");
    await expect(readFile(join(output, "test/upstream/sample.test.ts"))).rejects.toThrow();
    expect(await readFile(join(output, "test/support/adapter.ts"), "utf8")).toBe("owned by us");
  });
});
