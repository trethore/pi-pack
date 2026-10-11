import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const checkout = resolve(root, process.argv[2] ?? "../../pi");
const source = "packages/codemode/test";
const target = join(root, "test/upstream");
const manifestPath = join(root, "upstream/baseline.json");
const replacements = new Map([
  ["../src/index.ts", "#test/support/upstream-adapter"],
  ["../src/source.ts", "#test/support/upstream-adapter"],
  ["../src/runtime/prelude-source.ts", "#test/support/upstream-adapter"],
]);
const hash = (text) => createHash("sha256").update(text).digest("hex");
const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing symlink: ${name}`);
    }
    if (entry.isDirectory()) {
      result.push(...(await listFiles(join(directory, entry.name), `${name}/`)));
    } else {
      result.push(name);
    }
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function adapt(text, file) {
  let result = text.replace(
    /(\bfrom\s+|^[ \t]*import[ \t]+|\bimport\s*\(\s*)(["'])([^"'\r\n]+)\2/gm,
    (match, prefix, quote, specifier) => {
      const replacement = replacements.get(specifier);
      if (replacement) {
        return `${prefix}${quote}${replacement}${quote}`;
      }
      if (specifier.startsWith(".")) {
        throw new Error(`Unmapped upstream import in ${file}: ${specifier}`);
      }
      if (!specifier.startsWith("node:") && specifier !== "vitest") {
        throw new Error(`Unexpected upstream dependency in ${file}: ${specifier}`);
      }
      return match;
    },
  );
  result = result.replaceAll(
    'new URL("../src/runtime/worker.ts", import.meta.url)',
    'new URL("../../dist/sandbox/worker.js", import.meta.url)',
  );
  if (result.includes("../src/")) {
    throw new Error(`Unmapped upstream source reference in ${file}`);
  }
  return result;
}

async function previousBaseline() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function checkDestination(previous) {
  const recordedFiles = previous?.files ?? [];
  let existing;
  try {
    existing = await listFiles(target);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  for (const file of existing) {
    const recorded = recordedFiles.find((entry) => entry.path === file);
    if (!recorded || hash(await readFile(join(target, file))) !== recorded.importedSha256) {
      throw new Error(`Refusing to overwrite untracked or edited imported test: ${file}`);
    }
  }
  for (const file of recordedFiles) {
    if (!existing.includes(file.path)) {
      throw new Error(`Imported test was deleted locally: ${file.path}`);
    }
  }
}

async function main() {
  if (process.argv.length > 3) {
    throw new Error("Usage: npm run upstream:import -- [checkout-path]");
  }
  const commit = git("rev-parse", "HEAD");
  if (git("status", "--porcelain", "--", "packages/codemode", "LICENSE")) {
    throw new Error("Upstream codemode sources or tests are modified; use a clean checkout");
  }
  const previous = await previousBaseline();
  await checkDestination(previous);
  const files = await listFiles(join(checkout, source));
  const selected = files.filter((file) => file.endsWith(".test.ts") || file.startsWith("fixtures/"));
  if (!selected.some((file) => file.endsWith(".test.ts"))) {
    throw new Error("No upstream tests found; refusing to replace the existing suite");
  }
  const entries = await Promise.all(
    selected.map(async (path) => {
      const original = await readFile(join(checkout, source, path), "utf8");
      const content = adapt(original, path);
      return { path, content, upstreamSha256: hash(original), importedSha256: hash(content) };
    }),
  );
  await installTests(entries, commit);
  reportChanges(previous, entries, selected);
  console.log(`Imported tests from ${commit}. Review upstream source changes separately.`);
}

async function installTests(entries, commit) {
  const stage = `${target}.staging`;
  const backup = `${target}.previous`;
  const stagedManifest = `${manifestPath}.staging`;
  // Stage everything before touching tracked tests. Failed adaptations leave the old suite intact.
  await mkdir(dirname(stage), { recursive: true });
  await mkdir(stage);
  try {
    for (const { path, content } of entries) {
      await mkdir(dirname(join(stage, path)), { recursive: true });
      await writeFile(join(stage, path), content);
    }
    let backedUp = false;
    try {
      await rename(target, backup);
      backedUp = true;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    try {
      await rename(stage, target);
      await mkdir(dirname(manifestPath), { recursive: true });
      await writeFile(
        stagedManifest,
        JSON.stringify(
          {
            repository: "https://github.com/earendil-works/pi.git",
            commit,
            source,
            files: entries.map(({ content: _content, ...entry }) => entry),
          },
          null,
          2,
        ) + "\n",
      );
      await rename(stagedManifest, manifestPath);
    } catch (error) {
      await rm(target, { recursive: true, force: true });
      if (backedUp) {
        await rename(backup, target);
      }
      throw error;
    }
    if (backedUp) {
      await rm(backup, { recursive: true });
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(stagedManifest, { force: true });
  }
}

function reportChanges(previous, entries, selected) {
  for (const entry of entries) {
    const old = previous?.files.find((file) => file.path === entry.path);
    console.log(
      `${old ? (old.importedSha256 === entry.importedSha256 ? "unchanged" : "changed") : "added"} ${entry.path}`,
    );
  }
  for (const old of previous?.files ?? []) {
    if (!selected.includes(old.path)) {
      console.log(`removed ${old.path}`);
    }
  }
}
await main();
