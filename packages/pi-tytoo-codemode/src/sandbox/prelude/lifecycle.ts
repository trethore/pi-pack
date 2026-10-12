import { prompts } from "#src/prompts/generated";
import { BridgeMessageType, type HostBridge } from "#src/sandbox/bridge-protocol";
import { MAX_OUTPUT_CHARS, MAX_OUTPUT_ITEMS } from "#src/sandbox/limits";
import { encodeJson } from "#src/sandbox/values";
import { describeError } from "#src/sandbox/prelude/errors";

function serializeReturn(value: unknown) {
  const serialized = encodeJson(value);
  if (serialized === undefined) {
    return undefined;
  }

  // Normalize raw JSON so its checked size and transferred value match the rendered output.
  const decoded: unknown = JSON.parse(serialized);
  const payload = JSON.stringify(decoded);
  return { payload, characters: typeof decoded === "string" ? decoded.length : payload.length };
}

export function createLifecycle(bridge: HostBridge, serializeWrites: () => string) {
  let finished = false;
  let outputChars = 0;
  let outputItems = 0;
  const exitSignal = Object.freeze({});

  function done(ok: boolean, payload: string | undefined, writes?: string): void {
    if (finished) {
      return;
    }

    finished = true;
    bridge(BridgeMessageType.Done, ok, payload, writes);
  }

  function fail(error: unknown): void {
    done(false, describeError(error));
  }

  function recordOutput(characters: number): void {
    outputChars += characters;
    outputItems++;

    if (outputChars > MAX_OUTPUT_CHARS || outputItems > MAX_OUTPUT_ITEMS) {
      const error = new RangeError(
        prompts.results.outputLimit({ characters: MAX_OUTPUT_CHARS, items: MAX_OUTPUT_ITEMS }),
      );
      fail(error);
      throw error;
    }
  }

  function complete(value: unknown): void {
    if (finished) {
      return;
    }

    try {
      const returned = value === undefined ? undefined : serializeReturn(value);
      if (isFinished()) {
        return;
      }
      if (returned !== undefined) {
        recordOutput(returned.characters);
      }
      done(true, returned?.payload, serializeWrites());
    } catch (error) {
      fail(error);
    }
  }

  function isFinished(): boolean {
    return finished;
  }

  function exit(this: void): never {
    try {
      done(true, undefined, serializeWrites());
    } catch (error) {
      fail(error);
    }

    throw exitSignal;
  }

  function run(fn: () => Promise<unknown>): void {
    let promise: Promise<unknown>;
    try {
      promise = fn();
    } catch (error) {
      fail(error);
      return;
    }

    void Promise.prototype.then.call(promise, complete, fail);
  }

  function stalled(hasPending: boolean): boolean {
    if (finished || hasPending) {
      return false;
    }

    fail(new Error(prompts.results.stalled));

    return true;
  }

  return { isFinished, recordOutput, exit, run, stalled };
}
