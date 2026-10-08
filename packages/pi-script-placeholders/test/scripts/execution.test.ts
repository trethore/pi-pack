import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import { Scope } from "#src/constants";
import { executeScript } from "#src/scripts/execution";
import { useWorkspace } from "#test/workspace";

const files = useWorkspace();

async function execute(source: string, limits = { timeoutMs: 3000, maxOutputChars: 1000 }, extension = "mjs") {
  const path = await files.script("test", source, Scope.PROJECT, extension);
  return executeScript({ name: "test", path, scope: Scope.PROJECT }, files.cwd, limits);
}

it.each([
  ["", ""],
  ["\n", ""],
  ["value\r\n", "value"],
  ["  value \n\n", "  value \n"],
  ["value\r", "value\r"],
])("preserves stdout except for one final line ending: %j", async (source, expected) => {
  // Act
  const result = await execute(`process.stdout.write(${JSON.stringify(source)});`);

  // Assert
  expect(result).toEqual({ ok: true, output: expected });
});

it.each([
  ["mjs", "import { platform } from 'node:os'; process.stdout.write(platform());"],
  ["js", "const { platform } = require('node:os'); process.stdout.write(platform());"],
])("runs %s scripts with Node.js", async (extension, source) => {
  // Act / Assert
  expect(await execute(source, undefined, extension)).toEqual({ ok: true, output: process.platform });
});

it("counts decoded characters rather than UTF-8 bytes, including split multibyte writes", async () => {
  // Act
  const result = await execute(
    `
    process.stdout.write(Buffer.from([0xc3]));
    setTimeout(() => process.stdout.write(Buffer.from([0xa9, 0xc3, 0xa9])), 10);
  `,
    { timeoutMs: 3000, maxOutputChars: 2 },
  );

  // Assert
  expect(result).toEqual({ ok: true, output: "\u00e9\u00e9" });
});

it("rejects oversized output instead of truncating it", async () => {
  // Act
  const result = await execute("process.stdout.write('12345');", { timeoutMs: 3000, maxOutputChars: 4 });

  // Assert
  expect(result).toEqual({ ok: false, reason: "output exceeded maxOutputChars" });
});

it("terminates scripts that ignore SIGTERM", async () => {
  // Act
  const result = await execute("process.on('SIGTERM', () => {}); setInterval(() => {}, 10);", {
    timeoutMs: 200,
    maxOutputChars: 1000,
  });

  // Assert
  expect(result).toEqual({ ok: false, reason: "execution timed out" });
});

it.skipIf(process.platform === "win32")("terminates descendants in the same POSIX process group", async () => {
  // Arrange
  const marker = join(files.cwd, "descendant");
  const childSource = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 800);`;

  // Act
  const result = await execute(
    `
    import { spawn } from 'node:child_process';
    spawn(process.execPath, ['-e', ${JSON.stringify(childSource)}], { stdio: 'inherit' });
    setInterval(() => {}, 10);
  `,
    { timeoutMs: 300, maxOutputChars: 1000 },
  );
  await delay(900);

  // Assert
  expect(result).toEqual({ ok: false, reason: "execution timed out" });
  await expect(readFile(marker, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

it("discards stderr without blocking or adding it to stdout", async () => {
  // Act
  const result = await execute("process.stderr.write('private'.repeat(100000)); process.stdout.write('ok');");

  // Assert
  expect(result).toEqual({ ok: true, output: "ok" });
});

it("reports process creation failures without leaking paths", async () => {
  // Act
  const result = await executeScript(
    { name: "test", path: join(files.root, "private.mjs"), scope: Scope.GLOBAL },
    join(files.root, "missing-private-directory"),
    { timeoutMs: 3000, maxOutputChars: 1000 },
  );

  // Assert
  expect(result).toEqual({ ok: false, reason: "could not start Node.js" });
});

it("does not wait for interactive stdin", async () => {
  // Act
  const result = await execute(
    "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('closed'));",
  );

  // Assert
  expect(result).toEqual({ ok: true, output: "closed" });
});
