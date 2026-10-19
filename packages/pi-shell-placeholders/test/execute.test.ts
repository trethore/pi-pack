import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execute } from "#src/execute";
import { expandPlaceholders } from "#src/placeholders";
import type { ExecutionConfig } from "#src/config";

let cwd: string;
const defaults: ExecutionConfig = { shell: "/bin/sh", timeoutMs: 1500, maxOutputChars: 1000 };

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "shell-execution-"));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function run(command: string, config: Partial<ExecutionConfig> = {}, signal = new AbortController().signal) {
  return execute(command, { ...defaults, ...config }, cwd, signal);
}

it("uses the cwd and preserves stdout exactly while discarding stderr", async () => {
  // Arrange
  await writeFile(join(cwd, "value"), "output\n\n");

  // Act / Assert
  await expect(run("cat value; printf 'not output' >&2")).resolves.toEqual({ ok: true, stdout: "output\n\n" });
});

it("uses the configured shell", async () => {
  // Arrange
  const shell = join(cwd, "custom-shell");
  await writeFile(shell, '#!/bin/sh\nexport SHELL_PLACEHOLDER_TEST=custom\nexec /bin/sh "$@"\n', { mode: 0o755 });

  // Act / Assert
  await expect(run('printf "%s" "$SHELL_PLACEHOLDER_TEST"', { shell })).resolves.toEqual({
    ok: true,
    stdout: "custom",
  });
});

it.each([
  ["printf partial; exit 2", {}, "code 2"],
  ["printf 12345", { maxOutputChars: 4 }, "maxOutputChars"],
  ["printf partial; sleep 10", { timeoutMs: 60 }, "timeoutMs"],
  ["true", { shell: "/missing-shell" }, "could not execute shell"],
  ["printf '\u0000'", {}, "could not execute shell"],
  ["kill -TERM $$", {}, "SIGTERM"],
])("discards all output on failure: %s", async (command, config, reason) => {
  // Act
  const result = await run(command, config);

  // Assert
  expect(result.ok).toBe(false);
  expect(result).toHaveProperty("reason", expect.stringContaining(reason));
});

it("counts Unicode code points and accepts output exactly at the limit", async () => {
  // Act / Assert
  await expect(run(String.raw`printf '\360\237\230\200\303\251'`, { maxOutputChars: 2 })).resolves.toEqual({
    ok: true,
    stdout: "\u{1f600}\u00e9",
  });
  await expect(run(String.raw`printf '\360\237\230\200\303\251x'`, { maxOutputChars: 2 })).resolves.toMatchObject({
    ok: false,
  });
});

it("bounds output and stops an infinite producer", async () => {
  // Act / Assert
  await expect(run("yes x", { maxOutputChars: 16 })).resolves.toHaveProperty(
    "reason",
    expect.stringContaining("maxOutputChars"),
  );
});

it("does not wait for a descendant holding stdout open beyond the timeout", async () => {
  // Act / Assert
  await expect(run("sleep 20 & exit 0", { timeoutMs: 60 })).resolves.toHaveProperty(
    "reason",
    expect.stringContaining("timeoutMs"),
  );
});

it("kills ordinary descendants when timing out", async () => {
  // Arrange
  const command = "sh -c 'echo $$ > child.pid; sleep 20' & wait";

  // Act
  await run(command, { timeoutMs: 150 });
  const pid = Number(await readFile(join(cwd, "child.pid"), "utf8"));

  // Assert
  await vi.waitFor(async () => {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
    expect(stat === "" || /\) Z /.test(stat)).toBe(true);
  });
});

it("cancels active execution and skips already cancelled commands", async () => {
  // Arrange
  const controller = new AbortController();
  const pending = run("sleep 20", {}, controller.signal);

  // Act
  controller.abort();

  // Assert
  await expect(pending).resolves.toEqual({ ok: false, reason: "execution cancelled" });
  await expect(run("touch forbidden", {}, controller.signal)).resolves.toMatchObject({ ok: false });
  await expect(readFile(join(cwd, "forbidden"))).rejects.toThrow();
});

function expand(text: string, execution: Partial<ExecutionConfig> = {}) {
  const warn = vi.fn();
  return {
    warn,
    result: expandPlaceholders(text, {
      cwd,
      execution: { ...defaults, ...execution },
      signal: new AbortController().signal,
      warn,
    }),
  };
}

it("expands multiline commands sequentially with independent limits", async () => {
  // Arrange
  const input = "A !`printf first > value\ncat value` B !`cat value; printf second`";
  const expansion = expand(input, { maxOutputChars: 11 });

  // Act / Assert
  await expect(expansion.result).resolves.toBe("A first B firstsecond");
  expect(expansion.warn).not.toHaveBeenCalled();
});

it("preserves failed placeholders, warns once each, and continues", async () => {
  // Arrange
  const expansion = expand("!`printf hidden; exit 1` !`printf too-long` !`printf ok`", { maxOutputChars: 3 });

  // Act / Assert
  await expect(expansion.result).resolves.toBe("!`printf hidden; exit 1` !`printf too-long` ok");
  expect(expansion.warn).toHaveBeenCalledTimes(2);
});

it("never interprets stdout as another placeholder or as template arguments", async () => {
  // Arrange
  await writeFile(join(cwd, "literal"), "!`touch forbidden` $1\n");
  const expansion = expand("!`cat literal`");

  // Act / Assert
  await expect(expansion.result).resolves.toBe("!`touch forbidden` $1\n");
  await expect(readFile(join(cwd, "forbidden"))).rejects.toThrow();
});

it.each(["plain `touch forbidden`", "\\!`touch forbidden`", "!`touch forbidden"])(
  "leaves literal or incomplete syntax unchanged: %s",
  async (input) => {
    // Act / Assert
    await expect(expand(input).result).resolves.toBe(input);
    await expect(readFile(join(cwd, "forbidden"))).rejects.toThrow();
  },
);

it("supports an empty command and an escaped backtick in a command", async () => {
  // Act / Assert
  await expect(expand("a!``b !`printf \\``").result).resolves.toBe("ab `");
});
