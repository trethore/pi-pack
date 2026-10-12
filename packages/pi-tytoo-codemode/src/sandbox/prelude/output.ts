import { stringValue, encodeJson } from "#src/sandbox/values";
import { BridgeMessageType, BridgeOutputType, type HostBridge } from "#src/sandbox/bridge-protocol";
import { formatValue } from "#src/sandbox/prelude/errors";
import { parseImage } from "#src/sandbox/prelude/images";
import type { createLifecycle } from "#src/sandbox/prelude/lifecycle";

function outputText(value: unknown): string {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return stringValue(value);
  }

  return encodeJson(value) ?? stringValue(value);
}

function createConsoleMethod(emitOutput: (kind: BridgeOutputType, data: string) => void) {
  function writeConsole(...args: unknown[]): void {
    emitOutput(BridgeOutputType.Console, args.map(formatValue).join(" "));
  }

  return writeConsole;
}

export function createOutput(bridge: HostBridge, lifecycle: ReturnType<typeof createLifecycle>) {
  function emitOutput(kind: BridgeOutputType, data: string, mimeType?: string): void {
    if (lifecycle.isFinished()) {
      return;
    }

    lifecycle.recordOutput(data.length);

    bridge(BridgeMessageType.Output, kind, data, mimeType);
  }

  function text(this: void, value: unknown): void {
    let rendered: string;
    try {
      rendered = outputText(value);
    } catch (error) {
      throw new TypeError(error instanceof Error ? error.message : stringValue(error), { cause: error });
    }

    emitOutput(BridgeOutputType.Text, rendered);
  }

  function image(this: void, value: unknown): void {
    const { data, mimeType } = parseImage(value);

    emitOutput(BridgeOutputType.Image, data, mimeType);
  }

  const console = Object.freeze({
    log: createConsoleMethod(emitOutput),
    info: createConsoleMethod(emitOutput),
    warn: createConsoleMethod(emitOutput),
    error: createConsoleMethod(emitOutput),
    debug: createConsoleMethod(emitOutput),
  });

  return { console, text, image };
}
