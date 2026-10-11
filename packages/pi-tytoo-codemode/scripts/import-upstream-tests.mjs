import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const checkout = resolve(root, process.argv[2] ?? "../../pi");
const source = "packages/codemode/test";
const upstreamRoot = join(checkout, "packages/codemode");
const sourceDirectory = join(checkout, source);
const target = join(root, "test/upstream");
const manifestPath = join(root, "upstream/baseline.json");

const replacements = new Map([
  [join(upstreamRoot, "src/index.ts"), "#test/support/upstream-adapter"],
  [join(upstreamRoot, "src/source.ts"), "#test/support/upstream-adapter"],
  [join(upstreamRoot, "src/runtime/prelude-source.ts"), "#test/support/upstream-adapter"],
]);
const upstreamWorker = join(upstreamRoot, "src/runtime/worker.ts");
const localWorker = join(root, "dist/sandbox/worker.js");

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
  const directory = dirname(join(sourceDirectory, file));

  let result = text.replace(
    /(\bfrom\s+|^[ \t]*import[ \t]+|\bimport\s*\(\s*)(["'])([^"'\r\n]+)\2/gm,
    (match, prefix, quote, specifier) => {
      const replacement = replacements.get(resolve(directory, specifier));
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

  result = adaptWorkerUrls(result, file);

  if (result.includes("../src/")) {
    throw new Error(`Unmapped upstream source reference in ${file}`);
  }

  return result;
}

function adaptWorkerUrls(text, file) {
  const directory = dirname(join(sourceDirectory, file));
  const outputDirectory = dirname(join(target, file));

  return text.replace(
    /(\bnew\s+URL\s*\(\s*)(["'])([^"'\r\n]+)\2(?=\s*,\s*import\.meta\.url\s*\))/g,
    (match, prefix, quote, specifier) => {
      if (resolve(directory, specifier) !== upstreamWorker) {
        return match;
      }

      const path = relative(outputDirectory, localWorker).replaceAll("\\", "/");
      return `${prefix}${quote}${path}${quote}`;
    },
  );
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

  const files = await listFiles(sourceDirectory);
  const selected = files.filter((file) => file.endsWith(".test.ts") || file.startsWith("fixtures/"));
  if (!selected.some((file) => file.endsWith(".test.ts"))) {
    throw new Error("No upstream tests found; refusing to replace the existing suite");
  }

  const entries = await Promise.all(
    selected.map(async (path) => {
      const original = await readFile(join(sourceDirectory, path), "utf8");
      const content = adapt(original, path);
      return { path, content, upstreamSha256: hash(original), importedSha256: hash(content) };
    }),
  );

  await installTests(entries, commit);

  reportChanges(previous, entries, selected);
  console.log(`Imported tests from ${commit}. Review upstream source changes separately.`);
}

async function stageTests(entries, stage) {
  for (const { path, content } of entries) {
    const destination = join(stage, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}

async function stageBaseline(entries, commit, stagedManifest) {
  const baseline = {
    repository: "https://github.com/earendil-works/pi.git",
    commit,
    source,
    files: entries.map(({ content: _content, ...entry }) => entry),
  };

  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(stagedManifest, JSON.stringify(baseline, null, 2) + "\n");
}

async function backupTests(backup) {
  try {
    await rename(target, backup);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function replaceTests(stage, backup, stagedManifest) {
  const backedUp = await backupTests(backup);

  try {
    await rename(stage, target);
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
}

async function installTests(entries, commit) {
  const stage = `${target}.staging`;
  const backup = `${target}.previous`;
  const stagedManifest = `${manifestPath}.staging`;

  // Stage everything before touching tracked tests. Failed staging leaves the old suite intact.
  await mkdir(dirname(stage), { recursive: true });
  await mkdir(stage);

  try {
    await stageTests(entries, stage);
    await stageBaseline(entries, commit, stagedManifest);

    await replaceTests(stage, backup, stagedManifest);
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(stagedManifest, { force: true });
  }
}

function reportChanges(previous, entries, selected) {
  for (const entry of entries) {
    const old = previous?.files.find((file) => file.path === entry.path);
    let status = "added";
    if (old) {
      status = old.importedSha256 === entry.importedSha256 ? "unchanged" : "changed";
    }

    console.log(`${status} ${entry.path}`);
  }

  for (const old of previous?.files ?? []) {
    if (!selected.includes(old.path)) {
      console.log(`removed ${old.path}`);
    }
  }
}

await main();
