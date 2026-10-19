import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);

it("transforms native prompts in the bundled CLI without contacting a provider", async () => {
  // Arrange
  const root = await mkdtemp(join(tmpdir(), "shell-bundle-"));
  const agentDir = join(root, "agent");
  await mkdir(join(root, ".pi", "prompts"), { recursive: true });
  await mkdir(agentDir);
  await copyFile(new URL("./fixtures/fake-provider.ts", import.meta.url), join(root, "provider.ts"));
  await writeFile(join(root, ".pi", "prompts", "review.md"), "Template !`printf shell-template`");
  const cli = fileURLToPath(
    new URL("../../../node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js", import.meta.url),
  );
  const extension = fileURLToPath(new URL("../src/index.ts", import.meta.url));

  try {
    // Act
    const running = exec(
      process.execPath,
      [
        cli,
        "--offline",
        "--no-extensions",
        "-e",
        extension,
        "-e",
        join(root, "provider.ts"),
        "--no-skills",
        "--no-themes",
        "--no-context-files",
        "--no-tools",
        "--no-session",
        "--approve",
        "--model",
        "shell-test/test",
        "--mode",
        "json",
        "--system-prompt",
        "System !`printf shell-system`",
        "-p",
        "/review",
      ],
      { cwd: root, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" }, timeout: 15000 },
    );
    running.child.stdin?.end();
    const { stdout, stderr } = await running;

    // Assert
    const captured = await readFile(join(root, "captured.json"), "utf8");
    expect(captured).toContain("System shell-system");
    expect(captured).toContain("Template shell-template");
    expect(captured).not.toContain("!`");
    expect(stdout).toContain("Template shell-template");
    expect(stderr).not.toMatch(/disabled|Failed to load/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);
