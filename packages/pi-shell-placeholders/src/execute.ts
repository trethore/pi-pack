import { spawn, type ChildProcess } from "node:child_process";
import { errorMessage } from "@pi-pack/utils/errors";
import type { ExecutionConfig } from "#src/config";

type ExecutionResult = { ok: true; stdout: string } | { ok: false; reason: string };

function killProcessGroup(child: ChildProcess): void {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // The group may have exited between the output event and cancellation.
    }
  }
  child.kill("SIGKILL");
}

export function execute(
  command: string,
  config: ExecutionConfig,
  cwd: string,
  signal: AbortSignal,
): Promise<ExecutionResult> {
  if (signal.aborted) {
    return Promise.resolve({ ok: false, reason: "execution cancelled" });
  }
  return new Promise<ExecutionResult>((resolve) => {
    const child = spawn(config.shell, ["-c", command], {
      cwd,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    let chars = 0;
    let failure: string | undefined;

    const fail = (reason: string): void => {
      if (failure !== undefined) {
        return;
      }
      failure = reason;
      stdout = "";
      killProcessGroup(child);
      // An escaped descendant must not hold our pipe open after cancellation.
      child.stdout.destroy();
    };
    const abort = (): void => fail("execution cancelled");
    const timeout = setTimeout(() => fail(`execution exceeded timeoutMs (${config.timeoutMs})`), config.timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (failure !== undefined) {
        return;
      }
      const characters = chunk[Symbol.iterator]();
      while (!characters.next().done) {
        chars++;
        if (chars > config.maxOutputChars) {
          fail(`stdout exceeded maxOutputChars (${config.maxOutputChars})`);
          return;
        }
      }
      stdout += chunk;
    });
    child.once("error", (error) => fail(`could not execute shell: ${errorMessage(error)}`));
    child.once("close", (code, exitSignal) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      if (failure !== undefined) {
        resolve({ ok: false, reason: failure });
      } else if (code === 0 && exitSignal === null) {
        resolve({ ok: true, stdout });
      } else {
        resolve({ ok: false, reason: exitSignal ? `terminated by ${exitSignal}` : `exited with code ${String(code)}` });
      }
    });
  }).catch((error: unknown): ExecutionResult => ({
    ok: false,
    reason: `could not execute shell: ${errorMessage(error)}`,
  }));
}
