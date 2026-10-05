import { spawn } from "node:child_process";
import type { Scope } from "#src/constants";
import type { ScriptTemplatesConfig } from "#src/config";

export interface Script {
  name: string;
  path: string;
  scope: Scope;
}

type ExecutionResult = { ok: true; output: string } | { ok: false; reason: string };

export function executeScript(
  script: Script,
  cwd: string,
  limits: ScriptTemplatesConfig["execution"],
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const detached = process.platform !== "win32";
    const child = spawn(process.versions.bun ? "node" : process.execPath, [script.path], {
      cwd,
      detached,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
      env: {
        ...process.env,
        PI_WORKSPACE_CWD: cwd,
        PI_SCRIPT_TEMPLATE_NAME: script.name,
        PI_SCRIPT_TEMPLATE_SCOPE: script.scope,
      },
    });
    let output = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function finish(result: ExecutionResult): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.stdout.destroy();
      resolve(result);
    }

    function terminate(reason: string): void {
      // Kill the process group on POSIX so children cannot keep the timeout alive.
      try {
        if (detached && child.pid !== undefined) {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        child.kill("SIGKILL");
      }
      finish({ ok: false, reason });
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (output.length + chunk.length > limits.maxOutputChars) {
        terminate("output exceeded maxOutputChars");
        return;
      }
      output += chunk;
    });
    child.on("error", () => finish({ ok: false, reason: "could not start Node.js" }));
    child.on("close", (code) => {
      if (code === 0) {
        finish({ ok: true, output: output.replace(/\r?\n$/, "") });
      } else {
        finish({ ok: false, reason: "script exited unsuccessfully" });
      }
    });
    timer = setTimeout(() => terminate("execution timed out"), limits.timeoutMs);
  });
}
